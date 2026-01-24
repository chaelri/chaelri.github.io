import os, sys, subprocess, warnings, re, io, difflib
from dotenv import load_dotenv

# --- 1. SILENCE & SETUP ---
os.environ["PYTHONWARNINGS"] = "ignore"
warnings.filterwarnings("ignore")
load_dotenv()

try:
    import readline
    readline.parse_and_bind("tab: complete")
except ImportError: pass

try:
    from google import genai
    from google.genai import types
    from PIL import Image, ImageGrab 
except ImportError:
    print("❌ Error: Run 'pip3 install google-genai Pillow rich python-dotenv'")
    sys.exit(1)

from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.live import Live
from rich import box

console = Console()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# --- 2. THE STRUCTURAL TOOLS ---

def list_files(directory: str = ".") -> str:
    files = []
    exclude = {".git", "node_modules", "__pycache__", ".npm_local", ".venv"}
    for root, dirs, fnames in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in exclude]
        for f in fnames:
            files.append(os.path.relpath(os.path.join(root, f), "."))
    res = "\n".join(files) if files else "Directory is empty."
    console.print(Panel(f"[dim]{res}[/]", title="🔎 list_files", border_style="green"))
    return res

def read_file(path: str) -> str:
    try:
        with open(path, "r") as f:
            content = f.read()
            console.print(Panel(f"Read {len(content)} chars from {path}", title="📖 read_file", border_style="green"))
            return content
    except Exception as e: return f"ERROR: {e}"

def replace_function(path: str, function_name: str, new_function_code: str) -> str:
    """
    Finds a JavaScript/Python function by name and replaces the entire body 
    using structural brace-matching. Safe for 60KB+ files.
    """
    try:
        if not os.path.exists(path): return f"ERROR: {path} not found."
        with open(path, "r") as f: content = f.read()

        # 1. Locate the start of the function
        # Matches: function name, async function name, const name = (...) =>
        patterns = [
            rf"function\s+{function_name}\s*\(",
            rf"const\s+{function_name}\s*=",
            rf"async\s+function\s+{function_name}\s*\("
        ]
        
        start_index = -1
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                start_index = match.start()
                break
        
        if start_index == -1:
            return f"ERROR: Function '{function_name}' not found in {path}."

        # 2. Find the bounds of the function using brace counting
        first_brace = content.find("{", start_index)
        if first_brace == -1: return "ERROR: Could not find opening brace."
        
        brace_count = 0
        end_index = -1
        for i in range(first_brace, len(content)):
            if content[i] == "{": brace_count += 1
            elif content[i] == "}": brace_count -= 1
            
            if brace_count == 0:
                end_index = i + 1
                break
        
        if end_index == -1: return "ERROR: Could not find matching closing brace."

        # 3. Visual Diffing
        old_code = content[start_index:end_index]
        diff = difflib.unified_diff(old_code.splitlines(keepends=True), 
                                    new_function_code.splitlines(keepends=True), 
                                    fromfile='Old Function', tofile='New Function')
        
        diff_text = "".join([f"[green]{l}[/]" if l.startswith('+') else f"[red]{l}[/]" if l.startswith('-') else f"[dim]{l}[/]" for l in diff])
        if diff_text: console.print(Panel(diff_text, title=f"✨ STRUCTURAL DIFF: {function_name}", border_style="bold green"))

        # 4. Save Changes
        new_content = content[:start_index] + new_function_code.strip() + content[end_index:]
        with open(path, "w") as f: f.write(new_content)
        
        return f"SUCCESS: Function '{function_name}' in {path} replaced structurally."

    except Exception as e: return f"ERROR: {e}"

def write_file(path: str, content: str) -> str:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
        with open(path, "w") as f: f.write(content)
        console.print(Panel(f"Saved {path}", title="💾 write_file", border_style="green"))
        return f"SUCCESS: {path} written."
    except Exception as e: return f"ERROR: {e}"

def shell_exec(command: str) -> str:
    console.print(Panel(f"{command}", title="⚡ CMD REQUEST", border_style="cyan", box=box.ROUNDED))
    if input("  Allow? (y/n): ").lower() != 'y': return "User cancelled."
    local_env = os.environ.copy()
    if command.startswith("npm"):
        npm_base = os.path.expanduser("~/Documents/.npm_local")
        local_env["npm_config_cache"] = os.path.join(npm_base, "cache")
        local_env["npm_config_prefix"] = os.path.join(npm_base, "global")
    res = subprocess.run(command, shell=True, capture_output=True, text=True, env=local_env)
    return f"OUT: {res.stdout}\nERR: {res.stderr}"

# --- 3. THE MIND FLOW ---

def run():
    console.print(Panel.fit("[bold cyan]TERMIGEN v4.9[/bold cyan]\n[dim]Structural Function Surgery Engine[/dim]", border_style="magenta", box=box.DOUBLE))

    tools = [list_files, read_file, replace_function, write_file, shell_exec]
    chat = client.chats.create(
        model="gemini-2.0-flash",
        config=types.GenerateContentConfig(
            tools=tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=False),
            system_instruction=(
                "You are TermiGen v4.9. You are a Structurally-Aware Developer Agent.\n\n"
                "Surgical Logic:\n"
                "1. If editing an existing JavaScript/Python file, use 'replace_function'.\n"
                "2. Identify the function name (e.g., renderDashboard) and provide the complete NEW version of that function.\n"
                "3. This tool automatically handles brace matching and indentation.\n"
                "4. If the code logic is NOT inside a function, use write_file.\n\n"
                "CONSTRAINT: If the user says 'don't implement', only provide the list of suggestions and stop."
            )
        )
    )

    while True:
        try:
            user_msg = console.input("\n[bold cyan]User > [/bold cyan]")
            if user_msg.lower() in ["exit", "quit"]: break
            
            message_parts = []
            if "/paste" in user_msg.lower():
                img = ImageGrab.grabclipboard()
                if isinstance(img, Image.Image):
                    message_parts.append(img)
                    console.print("[magenta]📷 Image attached from clipboard.[/]")
                    user_msg = user_msg.replace("/paste", "")
            message_parts.append(user_msg)

            current_thought = ""

            with Live(console=console, refresh_per_second=10, auto_refresh=True) as live:
                for chunk in chat.send_message_stream(message_parts):
                    if not chunk.candidates or not chunk.candidates[0].content: continue
                    
                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, 'text') and part.text:
                            current_thought += part.text
                            live.update(Panel(Markdown(current_thought), title="[bold magenta]Thought[/]", border_style="magenta"))
                        
                        if hasattr(part, 'function_call') and part.function_call:
                            live.stop()
                            if current_thought.strip():
                                console.print(Panel(Markdown(current_thought), title="[bold magenta]Thought[/]", border_style="magenta"))
                            current_thought = "" 
                            
                            fn_name = part.function_call.name
                            console.print(Panel(f"⚙️ ACTION: Calling `{fn_name}`...", border_style="cyan"))
                            live.start()

            if current_thought.strip():
                console.print(Panel(Markdown(current_thought), title="[bold magenta]Final Response[/]", border_style="magenta"))

            if hasattr(chunk, 'usage_metadata'):
                console.print(f"[dim]Tokens: {chunk.usage_metadata.total_token_count}[/dim]", justify="right")

        except KeyboardInterrupt: break
        except Exception as e: console.print(f"[bold red]Error:[/bold red] {e}")

if __name__ == "__main__":
    run()