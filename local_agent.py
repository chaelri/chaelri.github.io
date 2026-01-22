import os
import io
import contextlib
import json
import http.server
import socketserver
import threading
import time
from urllib import request, parse
import random # Used for dynamic typing messages

# --- Secret Management: Load API Key from Environment or .env ---
# Simple .env file loader (Standard Library Only)
def load_dotenv():
    try:
        with open('.env') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"\'')
    except FileNotFoundError:
        pass

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("FATAL: GEMINI_API_KEY not found. Please create a '.env' file with GEMINI_API_KEY=\"YOUR_KEY\".")
    exit(1)
# -----------------------------------------------------------------

# --- GLOBAL STATE MANAGEMENT (The Core of the New Polling System) ---
# This is where the Agent thread writes its progress.
AGENT_STATE = {
    'is_running': False,
    'is_complete': True,
    'chat_history': [],
    'tool_logs': [],
    'final_response': "Hello! I am your Autonomous Coding Agent. What new feature or bug fix can I develop for you today?",
    'total_tokens': 0,
    'total_duration': "0.00s",
    'agent_status': "Idle" # NEW: For enhanced typing indicator
}

# NEW: A global event to signal the agent thread to stop
AGENT_STOP_EVENT = threading.Event()

# --- 1. Agent Tools ---
def create_directory(dirname: str) -> str:
    """Creates a new directory (folder) if it does not already exist."""
    try:
        os.makedirs(dirname, exist_ok=True)
        return f"SUCCESS: Directory '{dirname}' created or already exists."
    except Exception as e:
        return f"ERROR: Failed to create directory '{dirname}': {e}"

def write_file(filename: str, content: str) -> str:
    """Writes content to a file. Used by the agent to create/update code."""
    try:
        if filename == 'local_agent.py':
            return "Error: Cannot modify the 'local_agent.py' agent file."
        
        dirname = os.path.dirname(filename)
        if dirname and not os.path.exists(dirname):
            dir_result = create_directory(dirname)
            if dir_result.startswith("ERROR"):
                return f"ERROR: Could not create directory for file write: {dir_result}"
        
        with open(filename, 'w') as f:
            f.write(content)
        return f"SUCCESS: Wrote {len(content)} chars to file: '{filename}'"
    except Exception as e:
        return f"ERROR: File write failed: {e}"

# NEW TOOL: Directory Tree (The Eyes)
def list_files(directory: str = ".") -> str:
    """Returns a visual tree of the directory structure to help the agent explore the codebase."""
    try:
        output = f"DIRECTORY STRUCTURE FOR '{directory}':\n"
        exclude_dirs = {'.git', '__pycache__', 'node_modules', '.venv', 'venv'}
        for root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            level = root.replace(directory, '').count(os.sep)
            indent = ' ' * 4 * level
            output += f"{indent}{os.path.basename(root)}/\n"
            sub_indent = ' ' * 4 * (level + 1)
            for f in files:
                output += f"{sub_indent}{f}\n"
        return output
    except Exception as e:
        return f"ERROR: Could not list directory: {e}"

# NEW TOOL: Read files and return content
def read_files(filenames: list) -> str:
    """Reads the content of specified files and returns a structured string."""
    output = "FILE CONTENTS:\n"
    for filename in filenames:
        if filename == 'local_agent.py':
            output += f"--- {filename} ---\nERROR: Access denied.\n\n"
            continue
        try:
            with open(filename, 'r') as f:
                content = f.read()
                output += f"--- {filename} ---\n{content}\n\n"
        except FileNotFoundError:
            output += f"--- {filename} ---\nERROR: File not found.\n\n"
        except Exception as e:
            output += f"--- {filename} ---\nERROR: Read error: {e}\n\n"
    return output

AVAILABLE_TOOLS = {
    "write_file": write_file,
    "list_files": list_files,
    "create_directory": create_directory,
    "read_files": read_files, 
}

# --- 2. Gemini API Connector ---
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

SYSTEM_INSTRUCTION = (
    "You are an **Autonomous Senior Web Developer Agent and Codebase Contributor** powered by Gemini. "
    "Your core function is to analyze, modify, and create HTML, JavaScript, and CSS (using Tailwind) files.\n\n"
    "STRATEGY:\n"
    "1. Use `list_files` to see the project structure before making changes.\n"
    "2. Use `read_files` to understand existing code context.\n"
    "3. Use `write_file` to create or modify files. When modifying, you MUST overwrite the ENTIRE content of the file with the updated code.\n"
    "Always think step-by-step and provide your reasoning before making a tool call."
)

TOOL_DEFINITIONS = [
    {
        "function_declarations": [
            {
                "name": "write_file",
                "description": "Writes (overwrites) the ENTIRE content of a file (e.g., index.html, script.js). Use 'path/to/file.ext' to place in subdirectories.",
                "parameters": {
                    "type": "OBJECT", "properties": {"filename": {"type": "STRING"}, "content": {"type": "STRING"}}, "required": ["filename", "content"],
                }
            },
            {
                "name": "list_files",
                "description": "Lists the directory tree of the workspace so you can explore the file structure.",
                "parameters": {
                    "type": "OBJECT", "properties": {"directory": {"type": "STRING", "description": "Path to list, defaults to '.'"}},
                }
            },
            {
                "name": "create_directory",
                "description": "Creates a new directory (folder) in the current working directory.",
                "parameters": {
                    "type": "OBJECT", "properties": {"dirname": {"type": "STRING"}}, "required": ["dirname"],
                }
            },
            {
                "name": "read_files",
                "description": "Reads the content of specified files and returns a structured string. Use this to get context on existing files.",
                "parameters": {
                    "type": "OBJECT", "properties": {"filenames": {"type": "ARRAY", "items": {"type": "STRING"}}}, "required": ["filenames"],
                }
            }
        ]
    }
]

def gemini_api_call(contents, tools):
    """Sends the request to the Gemini API and returns response and token count."""
    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
    
    final_tools = { "function_declarations": [] }
    for declaration_set in tools:
        if "function_declarations" in declaration_set:
            final_tools["function_declarations"].extend(declaration_set["function_declarations"])

    # Corrected payload structure. 'tools' is top-level.
    payload = {
        "contents": contents,
        "tools": [final_tools], 
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    
    try:
        with request.urlopen(req) as response:
            response_json = json.loads(response.read().decode())
            token_count = response_json.get('usageMetadata', {}).get('totalTokenCount', 0)
            return response_json, token_count
    except Exception as e:
        if hasattr(e, 'read'):
            error_body = e.read().decode('utf-8')
            return {"error": f"HTTP Error {e.code}: {e.reason}\nAPI Response: {error_body}"}, 0
        elif hasattr(e, 'code'):
            return {"error": f"HTTP Error {e.code}: {e.reason}"}, 0
        else:
            return {"error": str(e)}, 0


# --- 4. Agent Thread Logic (The new Agent runner) ---

def run_agent_loop(user_content):
    """Executes the entire multi-step autonomous loop in a background thread."""
    global AGENT_STATE
    
    # NEW: Clear the stop event at the start of a new loop
    AGENT_STOP_EVENT.clear()
    
    # Reset state for a new request
    AGENT_STATE['is_running'] = True
    AGENT_STATE['is_complete'] = False
    AGENT_STATE['tool_logs'] = []
    AGENT_STATE['total_tokens'] = 0
    AGENT_STATE['total_duration'] = "0.00s"
    
    start_time = time.time()
    
    # History setup
    if not AGENT_STATE['chat_history'] or AGENT_STATE['chat_history'][0]['parts'][0]['text'] != SYSTEM_INSTRUCTION:
        AGENT_STATE['chat_history'] = [{"role": "user", "parts": [{"text": SYSTEM_INSTRUCTION}]}]
    
    # Append the new user content
    AGENT_STATE['chat_history'].append(user_content)
    
    tool_call_count = 0
    
    # The token-efficient loop
    while True:
        # NEW: Check for stop signal at the start of the loop
        if AGENT_STOP_EVENT.is_set():
            AGENT_STATE['final_response'] = "Agent was manually cancelled by the user."
            AGENT_STATE['agent_status'] = "Cancelled"
            break
            
        AGENT_STATE['agent_status'] = random.choice(["Thinking...", "Processing context...", "Analyzing codebase structure..."])
        
        loop_start_time = time.time()
        
        # Apply Sliding Window for token efficiency
        MAX_CONTEXT_MESSAGES = 11  # System Instruction + 10 messages
        chat_turns = AGENT_STATE['chat_history'][1:]
        context_for_api = [AGENT_STATE['chat_history'][0]] + chat_turns[-(MAX_CONTEXT_MESSAGES - 1):]
        
        response_json_tuple = gemini_api_call(context_for_api, TOOL_DEFINITIONS)
        
        response_json = response_json_tuple[0]
        token_count = response_json_tuple[1]
        AGENT_STATE['total_tokens'] += token_count # Aggregate tokens
        
        loop_duration = time.time() - loop_start_time # Calculate loop duration
        
        # New: Server-side log output for progress tracking
        print(f"\n--- ⚙️ Agent Loop {tool_call_count + 1} Execution Log ---")
        print(f"| Tokens Consumed in Loop: {token_count}")
        print(f"| Loop Duration: {loop_duration:.2f}s")
        print(f"| Total Tokens: {AGENT_STATE['total_tokens']}")
        print("--------------------------------------\n")

        # Check for API error
        if 'error' in response_json:
            AGENT_STATE['final_response'] = response_json['error']
            AGENT_STATE['agent_status'] = "API Error"
            break

        if not response_json.get('candidates'):
            feedback = response_json.get('promptFeedback', {}).get('blockReason', None)
            if feedback:
                AGENT_STATE['final_response'] = f"API Blocked: Content rejected by the model. Reason: {feedback}"
                AGENT_STATE['agent_status'] = "Blocked"
                break
            
            AGENT_STATE['final_response'] = "API Error: No candidate response received from the model."
            AGENT_STATE['agent_status'] = "API Error"
            break

        candidate_obj = response_json['candidates'][0] # Store the candidate object

        # FIX 1: Check if 'content' key exists before accessing it (Original Fix)
        if 'content' not in candidate_obj:
            error_msg = f"API Error: Candidate response missing 'content' key. Response structure suggests content filtering or internal API issue. Raw Candidate: {json.dumps(candidate_obj)}"
            AGENT_STATE['final_response'] = error_msg
            print(f"FATAL AGENT ERROR: {error_msg}")
            AGENT_STATE['agent_status'] = "Fatal Error"
            break # Break the loop on fatal error

        candidate = candidate_obj['content'] # Access the content safely
        text_parts = [part['text'] for part in candidate.get('parts', []) if 'text' in part]
        function_calls = [part['functionCall'] for part in candidate.get('parts', []) if 'functionCall' in part]
        
        final_text_response = "\n".join(text_parts) if text_parts else ""
        
        if function_calls:
            tool_call_count += 1
            
            # Display Agent Reasoning (the final_text_response) in the tool log
            if final_text_response:
                # NEW: Update final_response to the reasoning text immediately for live update (simulated streaming)
                AGENT_STATE['final_response'] = final_text_response
                AGENT_STATE['tool_logs'].append(f"**🧠 Agent Reasoning (Loop {tool_call_count})**\n{final_text_response}")
            
            
            call_parts = [{"functionCall": call} for call in function_calls]
            model_parts_to_save = call_parts
            if final_text_response:
                model_parts_to_save = [{"text": final_text_response}] + call_parts
            
            AGENT_STATE['chat_history'].append({"role": "model", "parts": model_parts_to_save})
            
            tool_results_parts = []
            
            AGENT_STATE['agent_status'] = f"Calling Tools ({len(function_calls)})..."
            
            for i, call in enumerate(function_calls):
                # NEW: Check for stop signal again before executing a tool
                if AGENT_STOP_EVENT.is_set():
                    AGENT_STATE['final_response'] = "Agent was manually cancelled by the user during tool execution."
                    AGENT_STATE['agent_status'] = "Cancelled"
                    # Note: We append the tool-call message so the agent doesn't re-execute it next time
                    AGENT_STATE['chat_history'].append({"role": "tool", "parts": [{"functionResponse": {"name": call['name'], "response": {"result": "Cancelled"}}}]})
                    break 
                    
                function_name = call['name']
                args = call['args']
                
                if function_name in AVAILABLE_TOOLS:
                    # Special handling for list arguments in read_files
                    if function_name == 'read_files' and 'filenames' in args and isinstance(args['filenames'], str):
                         # The model sometimes sends a string list, convert it to a list
                        try:
                            args['filenames'] = json.loads(args['filenames'])
                        except json.JSONDecodeError:
                            args['filenames'] = [s.strip() for s in args['filenames'].split(',')]


                    result = AVAILABLE_TOOLS[function_name](**args)
                else:
                    result = f"ERROR: Unknown tool '{function_name}' requested."

                action_log = (
                    f"**🛠️ Tool Action (Loop {tool_call_count}, Action {i+1}/{len(function_calls)})**\n"
                    f"- **Tool:** `{function_name}`\n"
                    f"- **Args:** {json.dumps(args, indent=2)}\n"
                    f"- **Result:** {result}" # Keep full result for the hidden details
                )
                AGENT_STATE['tool_logs'].append(action_log)
                
                tool_results_parts.append({
                    "functionResponse": {
                        "name": function_name,
                        "response": {"result": result}
                    }
                })
            
            # If the loop was cancelled during tool execution, this list will be incomplete, but the break handles it.
            AGENT_STATE['chat_history'].append({"role": "tool", "parts": tool_results_parts})
            AGENT_STATE['final_response'] = "Executing tool actions and reflecting..."
            
            # If the break happened inside the tool execution loop, we need to break the outer loop too.
            if AGENT_STOP_EVENT.is_set():
                break
        
        elif final_text_response:
            # Final text response
            AGENT_STATE['chat_history'].append({"role": "model", "parts": [{"text": final_text_response}]})
            AGENT_STATE['final_response'] = final_text_response
            AGENT_STATE['agent_status'] = "Complete"
            break 
        
        else:
            AGENT_STATE['final_response'] = "Received an unknown response format from the model."
            AGENT_STATE['agent_status'] = "Unknown Response"
            break

    end_time = time.time()
    AGENT_STATE['total_duration'] = f"{end_time - start_time:.2f}s"
    AGENT_STATE['is_running'] = False
    AGENT_STATE['is_complete'] = True
    
    print(f"\n--- ✅ Agent Thread Complete ---")
    print(f"| Final Total Tokens: {AGENT_STATE['total_tokens']}")
    print(f"| Total Wall Time: {AGENT_STATE['total_duration']}")
    print("----------------------------------\n")


# --- 5. Built-in Web Server Handler (Main Thread) ---

class AgentWebHandler(http.server.BaseHTTPRequestHandler):
    
    # HTML is kept identical to the last working version
    HTML_CONTENT = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Autonomous Coding Agent</title>
        <!-- Tailwind CSS CDN -->
        <script src="https://cdn.tailwindcss.com"></script>
        <!-- Material Symbols Icon CDN -->
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
        
        <!-- Markdown & Syntax Highlighting -->
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-css.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"></script>

        <style>
            /* New: Charcoal Vibe - Deep slate background */
            body { 
                background-color: #0F172A; /* slate-950/900 mix */
                background-image: radial-gradient(circle at 1px 1px, #1E293B 1px, transparent 0); /* Subtle texture */
                background-size: 20px 20px;
            }
            .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
            #chat-window { max-height: 70vh; overflow-y: auto; scroll-behavior: smooth; padding-right: 1.5rem; }
            /* Custom Scrollbar for dark theme */
            #chat-window::-webkit-scrollbar { width: 8px; }
            #chat-window::-webkit-scrollbar-thumb { background-color: #334155; border-radius: 10px; } /* slate-700 */
            #chat-window::-webkit-scrollbar-track { background-color: transparent; }
            /* Auto-expanding textarea style */
            #user-input { resize: none; overflow-y: hidden; }
            /* Futuristic neon pulse - Changed to Cyan */
            @keyframes neon-pulse { 0% { box-shadow: 0 0 5px #06b6d4, 0 0 10px #06b6d4; } 50% { box-shadow: 0 0 10px #06b6d4, 0 0 20px #06b6d4; } 100% { box-shadow: 0 0 5px #06b6d4, 0 0 10px #06b6d4; } }
            .neon-border { border-color: #06b6d4; } /* cyan-500 */
            .neon-text { color: #06b6d4; } /* cyan-500 */
            .agent-message-enter { opacity: 0; transform: translateY(20px); }
            .agent-message-enter-active { opacity: 1; transform: translateY(0); transform: translateY(0); transition: opacity 300ms, transform 300ms; }

            /* Tool Log Styling */
            .tool-details { background-color: #1E293B; border-radius: 0.5rem; padding: 0.75rem; margin-top: 0.5rem; font-family: monospace; font-size: 0.75rem; white-space: pre-wrap; overflow-x: auto;}
            .tool-summary { font-weight: bold; cursor: pointer; display: flex; align-items: center; }
            details > summary::-webkit-details-marker { display: none; }
            details > summary::before { 
                content: '▶'; 
                margin-right: 0.5rem;
                font-size: 0.7rem;
                transition: transform 150ms ease;
            }
            details[open] > summary::before { 
                content: '▼';
            }
            .tool-summary-success { color: #FACC15; } /* yellow-400 */
            .tool-summary-error { color: #F87171; } /* red-400 */
            
            /* Error Tool Visual Emphasis */
            .tool-error-container { border-left-color: #EF4444 !important; background-color: #450A0A !important; } /* red-500 border, red-950 bg */
            .tool-error-container .tool-details { color: #FECACA !important; } /* red-200 text */
            
            /* New: Paste Area Styles */
            #paste-zone { border: 2px dashed #475569; background-color: #1E293B; padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #94A3B8; border-radius: 0.75rem; cursor: pointer; transition: all 150ms; } /* slate-600 border, slate-800 bg */
            #paste-zone:hover { border-color: #06b6d4; color: #06b6d4; }
            #paste-zone.has-image { border-color: #06b6d4; color: #06b6d4; background-color: #164E63; } /* cyan-700 darker */
            #image-preview { max-height: 100px; display: none; margin-top: 0.75rem; }
            /* New: Typing Indicator */
            #typing-indicator { color: #06b6d4; margin-left: 0.5rem; display: none; }
            /* New: File Context Styles */
            #file-context-preview { max-width: 100%; overflow-x: hidden; text-align: left; background-color: #1E293B; color: #94A3B8; padding: 0.75rem; border-radius: 0.75rem; border: 1px solid #334155; }
            #file-context-count { font-weight: bold; color: #FACC15; } /* yellow-400 */
            
            /* New: Modal Styles */
            .modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background-color: rgba(0, 0, 0, 0.75); display: none; justify-content: center; align-items: center; z-index: 1000;
            }
            .modal-content {
                background-color: #1E293B; padding: 20px; border-radius: 1rem; width: 80%; max-width: 900px; max-height: 80%;
                overflow-y: auto; color: #E2E8F0; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 2px solid #06b6d4;
            }
            .modal-content pre { background-color: #0F172A; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin-top: 1rem; }

            /* Markdown Styling Overrides for Chat */
            .prose pre { background-color: #0F172A !important; border: 1px solid #334155; border-radius: 0.5rem; padding: 1rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
            .prose code { color: #2DD4BF; font-family: monospace; } /* teal-400 */
            .prose strong { color: #E2E8F0; }
            .prose a { color: #06B6D4; text-decoration: underline; }
            .prose ul { list-style-type: disc; padding-left: 1.5rem; }
            .prose ol { list-style-type: decimal; padding-left: 1.5rem; }
        </style>
    </head>
    <body class="bg-slate-950 text-gray-100 p-8"> <!-- Increased body padding -->
        <div class="max-w-4xl mx-auto bg-slate-900 shadow-2xl shadow-black/50 rounded-2xl flex flex-col h-[90vh]">
            
            <header class="p-5 border-b border-gray-800 flex items-center shadow-lg"> <!-- Increased header padding -->
                <span class="material-symbols-outlined text-cyan-400 text-3xl mr-4">auto_fix_high</span> <!-- Cyan accent -->
                <h1 class="text-3xl font-extrabold tracking-tight">Autonomous Agent</h1>
                <p class="ml-auto text-sm text-gray-500 border border-gray-700 px-3 py-1 rounded-full bg-slate-950">Model: gemini-2.5-flash | Local</p>
            </header>

            <div id="chat-window" class="flex-grow p-6 space-y-5"> <!-- Increased chat padding and spacing -->
                <!-- Messages will be injected here -->
            </div>

            <footer class="p-6 border-t border-gray-800 bg-slate-900 rounded-b-2xl"> <!-- Increased footer padding -->
                <div id="token-display" class="text-xs text-gray-500 mb-3 border-b border-gray-800 pb-2">Total Tokens: 0 | Last Time: 0.00s</div>
                
                <!-- File Context Area -->
                <div class="flex flex-col w-full mb-3">
                    <label for="file-context-input" class="text-sm font-semibold text-gray-400 mb-2 flex justify-between items-center">
                        Code Context: <span id="file-context-count" class="text-yellow-400">0 Files Selected</span>
                    </label>
                    <div class="flex space-x-3">
                        <input type="file" id="file-context-input-files" multiple class="hidden">
                        <input type="file" id="file-context-input-folder" multiple webkitdirectory class="hidden">
                        <button id="file-context-button-files" class="w-1/2 text-sm bg-slate-800 hover:bg-slate-700 text-gray-300 p-3 rounded-xl transition duration-150 border border-gray-700 shadow-inner">
                            Select Files
                        </button>
                        <button id="file-context-button-folder" class="w-1/2 text-sm bg-slate-800 hover:bg-slate-700 text-gray-300 p-3 rounded-xl transition duration-150 border border-gray-700 shadow-inner">
                            Select Folder
                        </button>
                        <!-- NEW: View Context Button (Hidden by JS until files are selected) -->
                        <button id="view-context-btn" class="flex-shrink-0 text-sm bg-cyan-800 hover:bg-cyan-700 text-white p-3 rounded-xl transition duration-150 border border-cyan-700 shadow-inner" style="display: none;">
                            <span class="material-symbols-outlined align-middle text-lg">description</span>
                        </button>
                    </div>
                </div>
                
                <!-- Paste Zone -->
                <div class="flex flex-col w-full mb-3">
                    <div id="paste-zone" class="rounded-xl">Click or Drag/Drop Image Here, or use Ctrl/Cmd+V</div>
                    <img id="image-preview" class="rounded-xl object-contain mt-3 mx-auto shadow-lg" style="max-height: 100px;">
                    <input type="file" id="image-upload" accept="image/*" class="hidden">
                </div>
                
                <div class="flex">
                    <textarea id="user-input" rows="1" placeholder="Type your coding request (Enter to Send, Shift+Enter for Newline)..." 
                       class="flex-grow p-4 bg-slate-800 neon-border border-2 border-gray-700 hover:border-cyan-500 focus:border-cyan-500 rounded-l-xl text-white placeholder-gray-500 focus:ring-transparent focus:outline-none transition duration-150 ease-in-out text-base shadow-inner" 
                       autofocus></textarea>
                    <button id="send-btn" class="flex-shrink-0 px-6 py-3 bg-cyan-600 text-white font-bold rounded-r-xl hover:bg-cyan-700 transition duration-150 ease-in-out flex items-center shadow-xl shadow-cyan-500/30">
                        <span class="material-symbols-outlined mr-1">send</span> Send
                    </button>
                </div>
                <div id="typing-indicator" class="text-sm neon-text mt-2">
                    <span class="material-symbols-outlined animate-spin text-sm mr-1 align-middle">sync</span> Agent is thinking...
                </div>
            </footer>
        </div>

        <!-- NEW: Context Preview Modal -->
        <div id="context-preview-modal" class="modal-overlay" onclick="hideFileContextPreview(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center border-b border-gray-700 pb-3 mb-3">
                    <h2 class="text-xl font-bold text-cyan-400">Codebase Context Preview</h2>
                    <button onclick="hideFileContextPreview()" class="text-gray-400 hover:text-white">&times;</button>
                </div>
                <p class="text-sm text-gray-400" id="context-file-count-label"></p>
                <pre id="context-preview-content" class="text-xs"></pre>
            </div>
        </div>


        <script>
            const chatWindow = document.getElementById('chat-window');
            const userInput = document.getElementById('user-input');
            const sendBtn = document.getElementById('send-btn');
            const tokenDisplay = document.getElementById('token-display');
            const imageUpload = document.getElementById('image-upload');
            const pasteZone = document.getElementById('paste-zone');
            const imagePreview = document.getElementById('image-preview');
            const typingIndicator = document.getElementById('typing-indicator');
            const viewContextBtn = document.getElementById('view-context-btn'); 
            const contextPreviewModal = document.getElementById('context-preview-modal'); 
            const contextPreviewContent = document.getElementById('context-preview-content'); 
            const contextFileCountLabel = document.getElementById('context-file-count-label'); 
            
            const fileContextInputFiles = document.getElementById('file-context-input-files'); 
            const fileContextInputFolder = document.getElementById('file-context-input-folder'); 
            const fileContextButtonFiles = document.getElementById('file-context-button-files'); 
            const fileContextButtonFolder = document.getElementById('file-context-button-folder'); 
            const fileContextCount = document.getElementById('file-context-count'); 
            
            let uploadedFile = null; 
            let contextFiles = []; 
            let lastLogCount = 0; 
            let isPolling = false;
            const MAX_FILES_FOR_CONTEXT = 50; 
            const RUNNING_STATUSES = ["Thinking...", "Planning...", "Synthesizing...", "Reflecting..."]; 

            // Configure Marked.js for Syntax Highlighting
            marked.setOptions({
                highlight: function(code, lang) {
                    if (Prism.languages[lang]) {
                        return Prism.highlight(code, Prism.languages[lang], lang);
                    }
                    return code;
                },
                breaks: true,
                gfm: true
            });

            // JS for Auto-expanding Textarea
            function autoExpand() {
                userInput.style.height = 'auto';
                userInput.style.height = (userInput.scrollHeight) + 'px';
            }
            userInput.addEventListener('input', autoExpand);

            // --- FILE CONTEXT LOGIC ---
            function updateFileContext(files) {
                contextFiles = Array.from(files);
                if (contextFiles.length > MAX_FILES_FOR_CONTEXT) {
                    alert(`Warning: Too many files (${contextFiles.length}). Limiting context to the first ${MAX_FILES_FOR_CONTEXT} files to prevent API request rejection and high cost.`);
                    contextFiles = contextFiles.slice(0, MAX_FILES_FOR_CONTEXT);
                }
                fileContextCount.textContent = `${contextFiles.length} Files Selected`;
                
                // Show/Hide View Context Button
                viewContextBtn.style.display = contextFiles.length > 0 ? 'flex' : 'none';
                
                // Set button state to clear context
                const clearContext = () => {
                    contextFiles = [];
                    fileContextInputFiles.value = null;
                    fileContextInputFolder.value = null;
                    updateFileContext([]);
                };
                
                fileContextButtonFiles.onclick = clearContext;
                fileContextButtonFolder.onclick = clearContext;

                if (contextFiles.length > 0) {
                    fileContextButtonFiles.textContent = "Clear Context";
                    fileContextButtonFolder.textContent = "Clear Context";
                } else {
                    fileContextButtonFiles.textContent = "Select Files";
                    fileContextButtonFolder.textContent = "Select Folder";
                    fileContextButtonFiles.onclick = () => fileContextInputFiles.click();
                    fileContextButtonFolder.onclick = () => fileContextInputFolder.click();
                }
            }

            fileContextButtonFiles.addEventListener('click', () => fileContextInputFiles.click());
            fileContextButtonFolder.addEventListener('click', () => fileContextInputFolder.click());
            fileContextInputFiles.addEventListener('change', (e) => updateFileContext(e.target.files));
            fileContextInputFolder.addEventListener('change', (e) => updateFileContext(e.target.files));
            
            viewContextBtn.addEventListener('click', () => showFileContextPreview()); 

            async function buildFileContextString(files) {
                let filesContent = "";
                for (const file of files) {
                    try {
                        const content = await getFileContent(file);
                        const filename = file.webkitRelativePath || file.name; 
                        filesContent += `--- ${filename} ---\n${content}\n\n`;
                    } catch (e) {
                        filesContent += `--- ${file.webkitRelativePath || file.name} ---\nERROR: Could not read file: ${e}\n\n`;
                    }
                }
                return filesContent ? `CODEBASE CONTEXT (${files.length} files provided):\n${filesContent}` : "";
            }

            async function showFileContextPreview() {
                contextFileCountLabel.textContent = `${contextFiles.length} files selected. Generating preview...`;
                contextPreviewContent.textContent = 'Loading...';

                const contextString = await buildFileContextString(contextFiles);

                contextFileCountLabel.textContent = `${contextFiles.length} files. Total characters: ${contextString.length}.`;
                contextPreviewContent.textContent = contextString;
                contextPreviewModal.style.display = 'flex';
            }

            function hideFileContextPreview(event) {
                if (!event || event.target.id === 'context-preview-modal' || event.target.tagName === 'BUTTON') {
                    contextPreviewModal.style.display = 'none';
                }
            }
            // --- END FILE CONTEXT LOGIC ---


            // --- IMAGE PASTE/UPLOAD LOGIC ---
            function setupImagePaste() {
                pasteZone.addEventListener('click', () => imageUpload.click());
                imageUpload.addEventListener('change', (e) => {
                    uploadedFile = e.target.files[0] || null;
                    previewImage();
                });
                document.addEventListener('paste', handlePaste);
                pasteZone.addEventListener('drop', handleDrop);
                ['dragenter', 'dragover', 'dragleave'].forEach(eventName => {
                    pasteZone.addEventListener(eventName, preventDefaults, false);
                });
            }

            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            function handleDrop(e) {
                preventDefaults(e);
                const dt = e.dataTransfer;
                const file = dt.files[0];
                if (file && file.type.startsWith('image/')) {
                    uploadedFile = file;
                    previewImage();
                }
            }

            function handlePaste(e) {
                if (document.activeElement !== userInput) return;
                const items = e.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        e.preventDefault();
                        uploadedFile = items[i].getAsFile();
                        previewImage();
                        break;
                    }
                }
            }

            function previewImage() {
                if (uploadedFile) {
                    pasteZone.classList.add('has-image');
                    pasteZone.textContent = `Image: ${uploadedFile.name} | Click to Change`;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.src = e.target.result;
                        imagePreview.style.display = 'block';
                    };
                    reader.readAsDataURL(uploadedFile);
                } else {
                    pasteZone.classList.remove('has-image');
                    pasteZone.textContent = "Click or Drag/Drop Image Here, or use Ctrl/Cmd+V";
                    imagePreview.src = '';
                    imagePreview.style.display = 'none';
                }
            }
            // --- END IMAGE PASTE/UPLOAD LOGIC ---

            // --- UI RENDERING LOGIC ---
            function appendMessage(sender, text, isTool = false) {
                const msgDiv = document.createElement('div');
                let cssClasses = "message p-4 rounded-xl shadow-lg transition duration-300 agent-message-enter-active prose prose-invert max-w-none"; 
                let icon = "";

                if (sender === 'user') {
                    cssClasses += " user ml-auto bg-blue-700/80 rounded-tr-sm shadow-blue-900/50 max-w-[85%]"; 
                } else if (sender === 'agent') {
                    cssClasses += " agent mr-auto bg-slate-800/80 rounded-tl-sm shadow-slate-950/50 max-w-[85%]"; 
                    icon = '<div class="flex items-center mb-2"><span class="material-symbols-outlined mr-2 text-cyan-400 text-xl">robot_2</span><span class="text-xs font-bold text-cyan-400 uppercase tracking-widest">Agent</span></div>'; 
                } else if (isTool) {
                    if (!text.startsWith('**🧠')) {
                        const toolDetails = parseToolLog(text);
                        const hasError = toolDetails.errors.length > 0;
                        const actionCount = toolDetails.actions.length;
                        const firstAction = toolDetails.actions[0] || {};
                        const summaryText = hasError 
                            ? `🛠️ Executed ${actionCount} actions (Errors Detected)`
                            : `🛠️ Executed ${actionCount} actions (${firstAction.name || '...'})`;
                        
                        const detailsHtml = toolDetails.raw.map(log => 
                            `<div class="mt-2 p-2 rounded-lg ${log.hasError ? 'bg-red-950/70 text-red-200 border-l-2 border-red-500' : 'bg-slate-950/70 text-yellow-300 border-l-2 border-yellow-500'}">
                                ${marked.parse(log.text)}
                            </div>`
                        ).join('');

                        cssClasses = `message tool mr-auto border-l-4 p-4 my-3 shadow-inner rounded-r-xl transition duration-300 w-full ${hasError ? 'tool-error-container' : 'bg-slate-900 border-yellow-500'}`;
                        
                        msgDiv.innerHTML = `
                            <details class="text-sm">
                                <summary class="tool-summary ${hasError ? 'tool-summary-error' : 'tool-summary-success'}">
                                    ${summaryText}
                                </summary>
                                <div class="tool-details">
                                    ${toolDetails.reasoning ? `<div class="mb-3 p-2 border-b border-gray-700 text-cyan-300">**🧠 Reasoning**<br>${marked.parse(toolDetails.reasoning)}</div>` : ''}
                                    ${detailsHtml}
                                </div>
                            </details>
                        `;
                        chatWindow.appendChild(msgDiv);
                        chatWindow.scrollTop = chatWindow.scrollHeight;
                        Prism.highlightAllUnder(msgDiv);
                        return;
                        
                    } else {
                        cssClasses = "message tool mr-auto bg-gray-900 border-l-4 border-cyan-500 p-3 my-2 text-xs text-cyan-300 shadow-inner rounded-r-lg w-[90%] transition duration-300";
                        icon = '<div class="flex items-center mb-1"><span class="material-symbols-outlined mr-2 text-cyan-500 text-lg">psychology_alt</span><span class="font-bold uppercase">Reasoning</span></div>';
                    }
                }
                
                msgDiv.className = cssClasses;
                
                // Using marked.parse for robust markdown rendering
                const formattedContent = marked.parse(text);
                msgDiv.innerHTML = icon + formattedContent;
                
                chatWindow.appendChild(msgDiv);
                chatWindow.scrollTop = chatWindow.scrollHeight;
                Prism.highlightAllUnder(msgDiv);
            }

            function parseToolLog(logString) {
                const parts = logString.split('**🛠️ Tool Action');
                let toolActions = [];
                let reasoningText = null;

                if (parts[0].trim().startsWith('**🧠')) {
                    reasoningText = parts[0].trim().replace('**🧠 Agent Reasoning', '').trim();
                    parts.shift(); 
                } else {
                    parts.shift(); 
                }

                parts.forEach(part => {
                    const log = "**🛠️ Tool Action" + part;
                    const toolMatch = log.match(/- \*\*Tool:\*\* `(.*?)`/);
                    const argsMatch = log.match(/- \*\*Args:\*\* (.*?)\\n/s) || log.match(/- \*\*Args:\*\* (.*?)$/s);
                    const resultMatch = log.match(/- \*\*Result:\*\* (.*?)$/s);
                    const hasError = log.includes('ERROR:') || (resultMatch && (resultMatch[1].trim().startsWith('ERROR:') || resultMatch[1].trim().startsWith('Failed:')));
                    
                    toolActions.push({
                        name: toolMatch ? toolMatch[1] : 'Unknown',
                        args: argsMatch ? argsMatch[1] : '{}',
                        result: resultMatch ? resultMatch[1] : 'No result',
                        hasError: hasError,
                        text: log
                    });
                });

                return {
                    reasoning: reasoningText,
                    actions: toolActions,
                    errors: toolActions.filter(a => a.hasError),
                    raw: toolActions.map(a => ({ text: a.text, hasError: a.hasError }))
                };
            }
            // --- END UI RENDERING LOGIC ---


            // --- POLLING LOGIC ---
            async function startPolling() {
                isPolling = true;
                setControlsRunningState(true);
                
                let lastAgentStatus = "";

                while (isPolling) {
                    await new Promise(resolve => setTimeout(resolve, 500)); 

                    try {
                        const response = await fetch('/status');
                        const data = await response.json();
                        
                        for (let i = lastLogCount; i < data.tool_logs.length; i++) {
                            appendMessage('tool', data.tool_logs[i], true);
                        }
                        lastLogCount = data.tool_logs.length;
                        
                        tokenDisplay.textContent = `Total Tokens: ${data.total_tokens} | Last Time: ${data.total_duration}`;
                        
                        if (data.agent_status !== lastAgentStatus) {
                            if (RUNNING_STATUSES.includes(data.agent_status)) {
                                typingIndicator.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm mr-1 align-middle">sync</span> Agent is ${data.agent_status}`;
                            } else {
                                typingIndicator.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm mr-1 align-middle">sync</span> ${data.agent_status}`;
                            }
                            lastAgentStatus = data.agent_status;
                        }
                        
                        if (data.is_complete) {
                            if (lastLogCount == 0 && data.tool_logs.length == 0 && data.final_response) {
                                appendMessage('agent', data.final_response);
                            } else if (data.final_response && data.final_response !== lastAgentStatus) {
                                const lastChatMsg = data.chat_history[data.chat_history.length - 1];
                                const hasText = lastChatMsg && lastChatMsg.role === 'model' && lastChatMsg.parts.some(p => p.text);
                                
                                if (!hasText) {
                                    appendMessage('agent', data.final_response);
                                }
                            }
                            
                            isPolling = false;
                            setControlsRunningState(false);
                            break;
                        }
                        
                    } catch (error) {
                        console.error('Polling error:', error);
                        appendMessage('agent', 'Error: Lost connection to the agent server.', true);
                        isPolling = false;
                        setControlsRunningState(false);
                        break;
                    }
                }
            }

            function setControlsRunningState(isRunning) {
                if (isRunning) {
                    sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1">cancel</span> Cancel';
                    sendBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700', 'shadow-cyan-500/30');
                    sendBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'shadow-red-500/30');
                    sendBtn.removeEventListener('click', sendMessage);
                    sendBtn.addEventListener('click', sendCancel);
                    userInput.disabled = true;
                    typingIndicator.style.display = 'block';
                } else {
                    sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1">send</span> Send';
                    sendBtn.classList.remove('bg-red-600', 'hover:bg-red-700', 'shadow-red-500/30');
                    sendBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700', 'shadow-cyan-500/30');
                    sendBtn.removeEventListener('click', sendCancel);
                    sendBtn.addEventListener('click', sendMessage);
                    userInput.disabled = false;
                    typingIndicator.style.display = 'none';
                }
            }
            
            async function sendCancel() {
                if (!isPolling) return;
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1 animate-spin">sync</span> Stopping...';
                try {
                    const response = await fetch('/stop', { method: 'POST' });
                    if (!response.ok) {
                        appendMessage('agent', 'Error: Failed to send cancellation signal to server.', true);
                        setControlsRunningState(true); 
                    }
                } catch (error) {
                    console.error('Cancel error:', error);
                    appendMessage('agent', 'Error: Could not connect to send cancel signal.', true);
                    setControlsRunningState(true);
                }
                sendBtn.disabled = false;
            }


            async function sendMessage() {
                const message = userInput.value.trim();
                const file = uploadedFile;
                
                if (isPolling) return; 
                if (!message && !file && !contextFiles.length) return;

                sendBtn.disabled = true;
                typingIndicator.style.display = 'block';
                
                let base64Image = null;
                let imageMimeType = null;
                let fileContextString = ""; 

                if (contextFiles.length > 0) {
                    fileContextString = await buildFileContextString(contextFiles);
                    updateFileContext([]); 
                }

                if (file) {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    await new Promise(resolve => {
                        reader.onload = () => {
                            const [mime, base64] = reader.result.split(',');
                            base64Image = base64;
                            imageMimeType = mime.split(':')[1].split(';')[0];
                            resolve();
                        };
                        reader.onerror = () => { base64Image = null; resolve(); };
                    });
                    if (!base64Image) {
                        appendMessage('agent', 'Error: Failed to process image file.', true);
                        setControlsRunningState(false);
                        return;
                    }
                }
                
                let userDisplayMessage = message;
                if (fileContextString) {
                    const fileNames = fileContextString.match(/--- (.*?) ---/g).map(s => s.replace(/---| /g, '')).join(', ');
                    userDisplayMessage += `\n\n[Context Injected: ${fileNames.length > 50 ? fileNames.substring(0, 47) + '...' : fileNames}]`;
                }
                if (file) {
                    userDisplayMessage = `(Image: ${file.name}) ${userDisplayMessage}`;
                }
                appendMessage('user', userDisplayMessage);

                userInput.value = '';
                uploadedFile = null;
                previewImage(); 
                autoExpand(); 
                lastLogCount = 0; 

                const finalMessage = message + (fileContextString ? `\n\n${fileContextString}` : '');

                try {
                    const response = await fetch('/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            message: finalMessage,
                            image: base64Image,
                            mimeType: imageMimeType
                        })
                    });
                    
                    if (response.ok) {
                        startPolling(); 
                    } else {
                        const errorText = await response.text();
                        appendMessage('agent', `Server Error: ${errorText}`, true);
                        setControlsRunningState(false);
                    }
                } catch (error) {
                    console.error('Chat error:', error);
                    appendMessage('agent', 'Error: Could not connect to the agent server.', true);
                    setControlsRunningState(false);
                }
                sendBtn.disabled = false;
            }
            
            setControlsRunningState(false); 
            userInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    if (!userInput.disabled) sendMessage();
                }
            });
            
            setupImagePaste(); 
            autoExpand(); 
            updateFileContext([]); 
            
            setTimeout(() => {
                appendMessage('agent', "Hello! I am your Autonomous Coding Agent. What new feature or bug fix can I develop for you today?");
            }, 100);

            function getFileContent(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    if (file.size > 1024 * 1024 * 1) { 
                        reject(`File ${file.name} is too large (>1MB).`);
                        return;
                    }
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e.target.error); 
                    reader.readAsText(file);
                });
            }
        </script>
    </body>
    </html>
    """

    def do_POST(self):
        # NEW: Handle cancellation request
        if self.path == '/stop':
            AGENT_STOP_EVENT.set() # Set the global stop flag
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'Stop signal sent.')
            return
            
        if self.path == '/chat':
            if AGENT_STATE['is_running']:
                self.send_response(429)
                self.end_headers()
                self.wfile.write(b'Agent is already busy. Please wait.')
                return

            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            user_data = json.loads(post_data.decode('utf-8'))
            
            user_message = user_data.get('message', '')
            image_base64 = user_data.get('image', None)
            mime_type = user_data.get('mimeType', None)

            # Construct the multimodal content part for the thread
            user_content_parts = []
            if image_base64 and mime_type:
                user_content_parts.append({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": image_base64
                    }
                })
            user_content_parts.append({"text": user_message})
            user_content = {"role": "user", "parts": user_content_parts}

            # Start the agent thread
            thread = threading.Thread(target=run_agent_loop, args=(user_content,))
            thread.start()

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "Agent thread started"}).encode('utf-8'))
            
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'404 Not Found')

    def do_GET(self):
        # NEW ENDPOINT: /status for polling
        if self.path == '/status':
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            
            # Return a COPY of the current state
            response_data = json.dumps({
                'is_complete': AGENT_STATE['is_complete'],
                'tool_logs': AGENT_STATE['tool_logs'],
                'final_response': AGENT_STATE['final_response'],
                'total_tokens': AGENT_STATE['total_tokens'],
                'total_duration': AGENT_STATE['total_duration'],
                'agent_status': AGENT_STATE['agent_status'],
                'chat_history': AGENT_STATE['chat_history']
            })
            self.wfile.write(response_data.encode('utf-8'))

        elif self.path == '/':
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(self.HTML_CONTENT.encode('utf-8'))
        
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'404 Not Found')


# --- 6. Server Initialization ---

def run_server(handler, port=8000):
    # Fix: Ensure chat history is initialized before the server starts
    if not AGENT_STATE['chat_history']:
        AGENT_STATE['chat_history'].append({"role": "user", "parts": [{"text": SYSTEM_INSTRUCTION}]})
        
    with socketserver.ThreadingTCPServer(("", port), handler) as httpd:
        print("="*70)
        print("🚀 Autonomous Coding Agent is running!")
        print(f"URL: http://127.0.0.1:{port}")
        print("WARNING: Agent has file and code execution authority on this machine.")
        print("Press Ctrl+C to stop the server.")
        print("="*70)
        httpd.serve_forever()

if __name__ == '__main__':
    run_server(AgentWebHandler)