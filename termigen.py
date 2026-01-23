import os, sys, subprocess, warnings, re, io, textwrap
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

# --- 2. THE SEMANTIC TOOLS ---

def list_files(directory: str = ".") -> str:
    """Lists files to see the project structure."""
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
    """Reads file content. Mandatory to see the code before patching."""
    try:
        with open(path, "r") as f:
            content = f.read()
            console.print(Panel(f"Read {len(content)} chars from {path}", title="📖 read_file", border_style="green"))
            return content
    except Exception as e: return f"ERROR: {e}"

def apply_smart_patch(path: str, search_block: str, replace_block: str) -> str:
    """
    Smarter patching: Finds a unique block regardless of indentation drift 
    and replaces it while preserving the file's style.
    """
    try:
        if not os.path.exists(path): return f"ERROR: {path} not found."
        with open(path, "r") as f: lines = f.readlines()
        
        # Normalize snippets for matching (strip trailing/leading empty lines)
        search_lines = [l for l in search_block.strip("\n").split("\n")]
        
        def lines_match(file_idx):
            """Checks if the search block matches starting at file_idx."""
            for i, s_line in enumerate(search_lines):
                if file_idx + i >= len(lines): return False
                # Semantic match: compare stripped lines to ignore indentation drift
                if lines[file_idx + i].strip() != s_line.strip(): return False
            return True

        matches = [i for i in range(len(lines)) if lines_match(i)]

        if len(matches) == 0:
            return "ERROR: Block not found. Ensure the SEARCH block matches the file exactly (ignoring indentation)."
        if len(matches) > 1:
            return f"ERROR: Found {len(matches)} identical blocks. Provide more context in SEARCH to be unique."

        start_idx = matches[0]
        # Detect indentation of the original first line to fix the replacement
        original_indent = re.match(r"^\s*", lines[start_idx]).group(0)
        
        # Prepare the replacement: apply original indentation to new lines
        new_content_lines = replace_block.strip("\n").split("\n")
        # We try to keep the relative indentation provided by AI
        indented_replacement = []
        for rl in new_content_lines:
            indented_replacement.append(original_indent + rl.lstrip() + "\n")

        # Perform the swap
        lines[start_idx : start_idx + len(search_lines)] = indented_replacement
        
        with open(path, "w") as f: f.writelines(lines)
            
        console.print(Panel(f"Successfully patched {path}", title="✨ apply_smart_patch", border_style="bold green"))
        return f"SUCCESS: {path} patched."
    except Exception as e: return f"ERROR: {e}"

def write_file(path: str, content: str) -> str:
    """Writes a brand new file or small file."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
        with open(path, "w") as f: f.write(content)
        console.print(Panel(f"Saved {path}", title="💾 write_file", border_style="green"))
        return f"SUCCESS: {path} written."
    except Exception as e: return f"ERROR: {e}"

def shell_exec(command: str) -> str:
    """Runs terminal commands (npm, pip, node)."""
    console.print(Panel(f"{command}", title="⚡ CMD REQUEST", border_style="cyan", box=box.ROUNDED))
    if input("  Allow? (y/n): ").lower() != 'y': return "User cancelled."
    local_env = os.environ.copy()
    if command.startswith("npm"):
        npm_base = os.path.expanduser("~/Documents/.npm_local")
        local_env["npm_config_cache"] = os.path.join(npm_base, "cache")
        local_env["npm_config_prefix"] = os.path.join(npm_base, "global")
    res = subprocess.run(command, shell=True, capture_output=True, text=True, env=local_env)
    return f"OUT: {res.stdout}\nERR: {res.stderr}"

# --- 3. THE ENGINE ---

def run():
    console.print(Panel.fit("[bold cyan]TERMIGEN v4.5[/bold cyan]\n[dim]Semantic Patching Engine[/dim]", border_style="magenta", box=box.DOUBLE))

    tools = [list_files, read_file, apply_smart_patch, write_file, shell_exec]
    chat = client.chats.create(
        model="gemini-2.0-flash",
        config=types.GenerateContentConfig(
            tools=tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=False),
            system_instruction=(
                "You are TermiGen v4.5, a world-class Semantic Coding Agent. "
                "Instead of rewriting whole files, use 'apply_smart_patch'.\n\n"
                "HOW TO PATCH:\n"
                "1. Read the file first to get the current context.\n"
                "2. Pick a unique 'search_block' from the file (3-5 lines is best).\n"
                "3. Provide the 'replace_block' with your changes.\n"
                "4. Your tool will ignore indentation differences, so focus on the logic.\n"
                "5. Ensure your search block is UNIQUE in the file.\n\n"
                "Be surgical. Stream your plan, then act immediately."
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
                    console.print("[magenta]📷 Image attached.[/]")
                    user_msg = user_msg.replace("/paste", "")
            message_parts.append(user_msg)

            current_thought = ""

            with Live(console=console, refresh_per_second=10, auto_refresh=True) as live:
                for chunk in chat.send_message_stream(message_parts):
                    try:
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
                                console.print(Panel(f"Calling `{part.function_call.name}`...", title="⚙️ ACTION", border_style="cyan"))
                                live.start()
                    except: continue

            if current_thought.strip():
                console.print(Panel(Markdown(current_thought), title="[bold magenta]Final[/]", border_style="magenta"))

        except KeyboardInterrupt: break
        except Exception as e: console.print(f"[bold red]Error:[/bold red] {e}")

if __name__ == "__main__":
    run()