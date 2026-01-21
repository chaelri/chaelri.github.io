import os
import io
import contextlib
import json
import http.server
import socketserver
import threading
import time
from urllib import request, parse

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
    'total_duration': "0.00s"
}

# --- 1. Agent Tools (Unchanged) ---
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
    "create_directory": create_directory,
    "read_files": read_files, 
}

# --- 2. Gemini API Connector (Updated System Instruction) ---
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

SYSTEM_INSTRUCTION = (
    "You are an **Autonomous Senior Web Developer Agent and Codebase Contributor** powered by Gemini. "
    "Your core function is to analyze, modify, and create HTML, JavaScript, and CSS (using Tailwind) files. "
    "When a user provides existing file content, you must use that as context. If the user asks to modify a file, "
    "you MUST use the `write_file` tool to overwrite the ENTIRE content of that file with the modified code. "
    "You have the authority to use the `write_file`, `create_directory`, and `read_files` tools. "
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
            break

        if not response_json.get('candidates'):
            feedback = response_json.get('promptFeedback', {}).get('blockReason', None)
            if feedback:
                AGENT_STATE['final_response'] = f"API Blocked: Content rejected by the model. Reason: {feedback}"
                break
            
            AGENT_STATE['final_response'] = "API Error: No candidate response received from the model."
            break

        candidate = response_json['candidates'][0]['content']
        text_parts = [part['text'] for part in candidate.get('parts', []) if 'text' in part]
        function_calls = [part['functionCall'] for part in candidate.get('parts', []) if 'functionCall' in part]
        
        final_text_response = "\n".join(text_parts) if text_parts else ""
        
        if function_calls:
            tool_call_count += 1
            
            # Display Agent Reasoning (the final_text_response) in the tool log
            if final_text_response:
                AGENT_STATE['tool_logs'].append(f"**🧠 Agent Reasoning (Loop {tool_call_count})**\n{final_text_response}")
            
            
            call_parts = [{"functionCall": call} for call in function_calls]
            model_parts_to_save = call_parts
            if final_text_response:
                model_parts_to_save = [{"text": final_text_response}] + call_parts
            
            AGENT_STATE['chat_history'].append({"role": "model", "parts": model_parts_to_save})
            
            tool_results_parts = []
            
            for call in function_calls:
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
                    f"**🛠️ Tool Action (Loop {tool_call_count})**\n"
                    f"- **Tool:** `{function_name}`\n"
                    f"- **Args:** {json.dumps(args, indent=2)}\n"
                    f"- **Result:** {result[:200]}..." 
                )
                AGENT_STATE['tool_logs'].append(action_log)
                
                tool_results_parts.append({
                    "functionResponse": {
                        "name": function_name,
                        "response": {"result": result}
                    }
                })
            
            AGENT_STATE['chat_history'].append({"role": "tool", "parts": tool_results_parts})
            AGENT_STATE['final_response'] = "Executing tool actions and reflecting..."
        
        elif final_text_response:
            # Final text response
            AGENT_STATE['chat_history'].append({"role": "model", "parts": [{"text": final_text_response}]})
            AGENT_STATE['final_response'] = final_text_response
            break 
        
        else:
            AGENT_STATE['final_response'] = "Received an unknown response format from the model."
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
        <style>
            body { background-color: #111827; }
            .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
            #chat-window { max-height: 70vh; overflow-y: auto; scroll-behavior: smooth; }
            /* Custom Scrollbar for dark theme */
            #chat-window::-webkit-scrollbar { width: 8px; }
            #chat-window::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 10px; }
            /* Auto-expanding textarea style */
            #user-input { resize: none; overflow-y: hidden; }
            /* Futuristic neon pulse */
            @keyframes neon-pulse { 0% { box-shadow: 0 0 5px #10b981, 0 0 10px #10b981; } 50% { box-shadow: 0 0 10px #10b981, 0 0 20px #10b981; } 100% { box-shadow: 0 0 5px #10b981, 0 0 10px #10b981; } }
            .neon-border { border-color: #10b981; }
            .neon-text { color: #10b981; }
            .agent-message-enter { opacity: 0; transform: translateY(20px); }
            .agent-message-enter-active { opacity: 1; transform: translateY(0); transition: opacity 300ms, transform 300ms; }
            /* New: Paste Area Styles */
            #paste-zone { border: 2px dashed #4b5563; background-color: #1f2937; padding: 0.5rem; text-align: center; font-size: 0.8rem; color: #9ca3af; border-radius: 0.5rem; cursor: pointer; }
            #paste-zone.has-image { border-color: #10b981; color: #10b981; }
            #image-preview { max-height: 100px; display: none; margin-top: 0.5rem; }
            /* New: Typing Indicator */
            #typing-indicator { color: #10b981; margin-left: 0.5rem; display: none; }
            /* New: File Context Styles */
            #file-context-preview { max-width: 100%; overflow-x: hidden; text-align: left; background-color: #1f2937; color: #9ca3af; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid #4b5563; }
            #file-context-count { font-weight: bold; color: #f9a825; }
        </style>
    </head>
    <body class="bg-gray-900 text-gray-100 p-6">
        <div class="max-w-4xl mx-auto bg-gray-800 shadow-2xl rounded-xl flex flex-col h-[90vh]">
            <header class="p-4 border-b border-gray-700 flex items-center">
                <span class="material-symbols-outlined text-green-400 text-3xl mr-3">auto_fix_high</span>
                <h1 class="text-2xl font-bold">Autonomous Agent</h1>
                <p class="ml-4 text-sm text-gray-400">Model: gemini-2.5-flash | Local Execution</p>
            </header>

            <div id="chat-window" class="flex-grow p-4 space-y-4">
                <!-- Initial Message is now handled by the JS/Polling after page load -->
            </div>

            <footer class="p-4 border-t border-gray-700">
                <div id="token-display" class="text-xs text-gray-400 mb-2">Total Tokens: 0 | Last Time: 0.00s</div>
                <div class="flex flex-col">
                    <!-- New: File Context Area -->
                    <div class="flex flex-col w-full mb-2">
                        <label for="file-context-input" class="text-xs text-gray-400 mb-1 flex justify-between items-center">
                            Code Context: <span id="file-context-count">0 Files Selected</span>
                        </label>
                        <div class="flex space-x-2">
                            <input type="file" id="file-context-input-files" multiple class="hidden">
                            <input type="file" id="file-context-input-folder" multiple webkitdirectory class="hidden">
                            <!-- FIX 1: Separated Buttons for file/folder -->
                            <button id="file-context-button-files" class="w-1/2 text-sm bg-gray-700 hover:bg-gray-600 p-2 rounded-lg transition duration-150 border border-gray-600">
                                Select Files
                            </button>
                            <button id="file-context-button-folder" class="w-1/2 text-sm bg-gray-700 hover:bg-gray-600 p-2 rounded-lg transition duration-150 border border-gray-600">
                                Select Folder
                            </button>
                        </div>
                    </div>
                    
                    <div class="flex flex-col w-full mb-2">
                        <!-- New: Paste Zone -->
                        <div id="paste-zone">Click or Drag/Drop Image Here, or use Ctrl/Cmd+V</div>
                        <img id="image-preview" class="rounded-lg object-contain mt-2 mx-auto" style="max-height: 100px;">
                        <input type="file" id="image-upload" accept="image/*" class="hidden">
                    </div>
                    <div class="flex">
                        <textarea id="user-input" rows="1" placeholder="Type your coding request (Enter to Send, Shift+Enter for Newline)..." 
                           class="flex-grow p-3 bg-gray-700 neon-border border-2 border-transparent hover:border-green-500 focus:border-green-500 rounded-l-lg text-white placeholder-gray-400 focus:ring-transparent focus:outline-none transition duration-150 ease-in-out" 
                           autofocus></textarea>
                        <button id="send-btn" class="flex-shrink-0 px-6 py-3 bg-green-600 text-white font-semibold rounded-r-lg hover:bg-green-700 transition duration-150 ease-in-out flex items-center shadow-lg hover:shadow-green-500/50">
                            <span class="material-symbols-outlined mr-1">send</span> Send
                        </button>
                    </div>
                    <div id="typing-indicator" class="text-sm neon-text mt-1">
                        <span class="material-symbols-outlined animate-spin text-sm mr-1 align-middle">sync</span> Agent is thinking...
                    </div>
                </div>
            </footer>
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
            
            const fileContextInputFiles = document.getElementById('file-context-input-files'); // New
            const fileContextInputFolder = document.getElementById('file-context-input-folder'); // New
            const fileContextButtonFiles = document.getElementById('file-context-button-files'); // New
            const fileContextButtonFolder = document.getElementById('file-context-button-folder'); // New
            const fileContextCount = document.getElementById('file-context-count'); 
            
            let uploadedFile = null; 
            let contextFiles = []; 
            let lastLogCount = 0; 
            let isPolling = false;
            const MAX_FILES_FOR_CONTEXT = 50; // Context Overload Pre-Check

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
                let cssClasses = "message p-3 rounded-xl shadow-md transition duration-300 agent-message-enter-active";
                let icon = "";

                if (sender === 'user') {
                    cssClasses += " user max-w-[80%] ml-auto bg-blue-600 rounded-tr-none";
                } else if (sender === 'agent') {
                    cssClasses += " agent max-w-[80%] mr-auto bg-gray-700 rounded-tl-none";
                    icon = '<span class="material-symbols-outlined mr-2 text-green-400 align-middle text-lg">robot_2</span>';
                } else if (isTool) {
                    // Changed icon and color for Reasoning vs Tool Action
                    if (text.startsWith('**🧠')) {
                        cssClasses = "message tool max-w-[90%] mr-auto bg-gray-900 border-l-4 border-cyan-500 p-3 my-2 text-xs text-cyan-300 shadow-inner rounded-r-lg whitespace-pre-wrap transition duration-300";
                        icon = '<span class="material-symbols-outlined mr-2 text-cyan-500 align-middle text-lg">psychology_alt</span>';
                    } else {
                        cssClasses = "message tool max-w-[90%] mr-auto bg-gray-900 border-l-4 border-yellow-500 p-3 my-2 text-xs text-yellow-300 shadow-inner rounded-r-lg whitespace-pre-wrap transition duration-300";
                        icon = '<span class="material-symbols-outlined mr-2 text-yellow-500 align-middle text-lg">code</span>';
                    }
                }
                
                msgDiv.className = cssClasses;
                
                // Bulletproof formatting logic
                let tempText = text;
                
                // 1. Handle bolding with ** (Escaped for Python: \\*\\*)
                tempText = tempText.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>'); 
                
                // 2. Handle backticks for code 
                tempText = tempText.replace(new RegExp('`(.*?)`', 'g'), '<code class="bg-gray-800 text-teal-400 px-1 rounded text-sm">$1</code>');
                
                // 3. Handle newlines (Escaped for Python: \\n)
                tempText = tempText.replace(/\\n/g, '<br>');

                const formattedText = tempText;

                msgDiv.innerHTML = icon + formattedText;
                chatWindow.appendChild(msgDiv);
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
            // --- END UI RENDERING LOGIC ---


            // NEW FUNCTION: Polling mechanism
            async function startPolling() {
                isPolling = true;
                typingIndicator.style.display = 'block';
                
                while (isPolling) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); 
                    
                    try {
                        const response = await fetch('/status');
                        const data = await response.json();
                        
                        // Display new tool logs (Incremental Rendering)
                        for (let i = lastLogCount; i < data.tool_logs.length; i++) {
                            appendMessage('tool', data.tool_logs[i], true);
                        }
                        lastLogCount = data.tool_logs.length;
                        
                        // Update status displays
                        tokenDisplay.textContent = `Total Tokens: ${data.total_tokens} | Last Time: ${data.total_duration}`;
                        
                        if (data.is_complete) {
                            // Display the final response
                            if (lastLogCount > 0 || !data.tool_logs.length) {
                                appendMessage('agent', data.final_response);
                            }
                            
                            // Reset state
                            isPolling = false;
                            sendBtn.disabled = false;
                            sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1">send</span> Send';
                            typingIndicator.style.display = 'none';
                            break;
                        }
                        
                    } catch (error) {
                        console.error('Polling error:', error);
                        // FIX: Added explicit message for a failed poll/connection loss
                        appendMessage('agent', 'Error: Lost connection to the agent server.', true);
                        isPolling = false;
                        sendBtn.disabled = false;
                        sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1">send</span> Send';
                        typingIndicator.style.display = 'none';
                        break;
                    }
                }
            }

            // FIX: The core sendMessage function (now starts the background agent and polling)
            async function sendMessage() {
                const message = userInput.value.trim();
                const file = uploadedFile;
                
                if (isPolling) return; // Prevent double submission
                if (!message && !file && !contextFiles.length) return;

                sendBtn.disabled = true;
                sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1 animate-spin">sync</span> Thinking...';
                typingIndicator.style.display = 'block';
                
                let base64Image = null;
                let imageMimeType = null;
                let fileContextString = ""; 

                // 1. Build File Context String
                if (contextFiles.length > 0) {
                    let filesContent = "";
                    for (const file of contextFiles) {
                        try {
                            const content = await getFileContent(file);
                            // Use file.webkitRelativePath for folder structure, else file.name
                            const filename = file.webkitRelativePath || file.name; 
                            filesContent += `--- ${filename} ---\n${content}\n\n`;
                        } catch (e) {
                            console.error(`Error reading file ${file.name}:`, e);
                        }
                    }
                    if (filesContent) {
                        fileContextString = `\n\nCODEBASE CONTEXT (${contextFiles.length} files provided):\n${filesContent}\n\n`;
                    }
                    
                    // Clear file context after reading and preparing the message
                    contextFiles = [];
                    fileContextInputFiles.value = null;
                    fileContextInputFolder.value = null;
                    updateFileContext([]);
                }

                // 2. Build Image Payload
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
                        sendBtn.disabled = false;
                        sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1">send</span> Send';
                        typingIndicator.style.display = 'none';
                        return;
                    }
                }
                
                // 3. Display User Message (including context prompt)
                let userDisplayMessage = message;
                if (fileContextString) {
                    const fileNames = fileContextString.match(/--- (.*?) ---/g).map(s => s.replace(/---| /g, '')).join(', ');
                    userDisplayMessage += `\n\n[Context Injected: ${fileNames}]`;
                }
                if (file) {
                    userDisplayMessage = `(Image: ${file.name}) ${userDisplayMessage}`;
                }
                appendMessage('user', userDisplayMessage);


                // 4. Clear Inputs & Send
                userInput.value = '';
                uploadedFile = null;
                previewImage(); 
                autoExpand(); 
                lastLogCount = 0; 

                // Final message sent to the backend
                const finalMessage = message + fileContextString;

                try {
                    // NEW: Kick off the background agent via POST
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
                        startPolling(); // Start polling for status updates
                    } else {
                        // Handle initial connection error
                        const errorText = await response.text();
                        appendMessage('agent', `Server Error: ${errorText}`, true);
                        sendBtn.disabled = false;
                        sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1">send</span> Send';
                        typingIndicator.style.display = 'none';
                    }

                } catch (error) {
                    console.error('Chat error:', error);
                    appendMessage('agent', 'Error: Could not connect to the agent server.', true);
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<span class="material-symbols-outlined mr-1">send</span> Send';
                    typingIndicator.style.display = 'none';
                }
            }
            
            // Attach listeners after the document is loaded
            sendBtn.addEventListener('click', sendMessage);
            userInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    sendMessage();
                }
            });
            
            // Initial setup calls
            setupImagePaste(); 
            autoExpand(); 
            
            // Initial welcome message 
            setTimeout(() => {
                appendMessage('agent', "Hello! I am your Autonomous Coding Agent. What new feature or bug fix can I develop for you today?");
            }, 100);

            // getFileContent must be in the global scope for the buttons
            function getFileContent(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
            }
        </script>
    </body>
    </html>
    """
    # HTML (end)

    def do_POST(self):
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
                'total_duration': AGENT_STATE['total_duration']
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