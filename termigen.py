import os, sys, subprocess, warnings, re, io, textwrap, difflib
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
    """Smarter patching with Visual Diffs and Self-Correction."""
    try:
        if not os.path.exists(path): return f"ERROR: {path} not found."
        with open(path, "r") as f: lines = f.readlines()
        search_lines = [l for l in search_block.strip("\n").split("\n")]
        
        def lines_match(file_idx):
            for i, s_line in enumerate(search_lines):
                if file_idx + i >= len(lines): return False
                if lines[file_idx + i].strip() != s_line.strip(): return False
            return True

        matches = [i for i in range(len(lines)) if lines_match(i)]

        if len(matches) == 0:
            file_preview = "".join(lines[:60]) 
            error_hint = f"ERROR: Search block not found in {path}. Check preview:\n\n{file_preview}"
            console.print(Panel(error_hint, title="❌ Patch Failed", border_style="red"))
            return error_hint

        if len(matches) > 1:
            return f"ERROR: Found {len(matches)} identical blocks. Provide more context."

        start_idx = matches[0]
        original_indent = re.match(r"^\s*", lines[start_idx]).group(0)
        new_content_lines = replace_block.strip("\n").split("\n")
        indented_replacement = [original_indent + rl.lstrip() + "\n" for rl in new_content_lines]

        # Generate Diff
        old_segment = lines[start_idx : start_idx + len(search_lines)]
        diff = difflib.unified_diff(old_segment, indented_replacement, fromfile='Original', tofile='Patched')
        diff_text = "".join([f"[green]{l}[/]" if l.startswith('+') else f"[red]{l}[/]" if l.startswith('-') else f"[dim]{l}[/]" for l in diff])
        if diff_text: console.print(Panel(diff_text, title=f"✨ DIFF: {path}", border_style="bold green"))

        lines[start_idx : start_idx + len(search_lines)] = indented_replacement
        with open(path, "w") as f: f.writelines(lines)
        return f"SUCCESS: {path} patched."
    except Exception as e: return f"ERROR: {e}"

def write_file(path: str, content: str) -> str:
    """Writes a brand new file."""
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
    console.print(Panel.fit("[bold cyan]TERMIGEN v4.7[/bold cyan]\n[dim]Mindful Agentic Engine[/dim]", border_style="magenta", box=box.DOUBLE))

    tools = [list_files, read_file, apply_smart_patch, write_file, shell_exec]
    chat = client.chats.create(
        model="gemini-2.0-flash",
        config=types.GenerateContentConfig(
            tools=tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=False),
            system_instruction=(
                "You are TermiGen v4.7. You are a Senior Developer Agent.\n\n"
                "STRICT PROTOCOLS:\n"
                "1. PRIORITIZE USER CONSTRAINTS: If the user says 'don't implement' or 'only list', you MUST NOT call write_file, patch_file, or shell_exec.\n"
                "2. SMART PATCHING: Use 'apply_smart_patch' for surgical edits. Read files first to get context.\n"
                "3. AUTONOMY: If a patch fails, analyze the error preview and retry IMMEDIATELY with a better search block.\n"
                "4. Be professional and concise. Stream your plan before acting."
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
                    if not chunk.candidates or not chunk.candidates[0].content: continue
                    
                    for part in chunk.candidates[0].content.parts:
                        # 1. Handle Text Streaming
                        if hasattr(part, 'text') and part.text:
                            current_thought += part.text
                            live.update(Panel(Markdown(current_thought), title="[bold magenta]Thought[/]", border_style="magenta"))
                        
                        # 2. Handle Tool Calls
                        if hasattr(part, 'function_call') and part.function_call:
                            # Finalize text before the tool runs to prevent duplication
                            live.stop()
                            if current_thought.strip():
                                console.print(Panel(Markdown(current_thought), title="[bold magenta]Thought[/]", border_style="magenta"))
                            current_thought = "" # Clear the buffer
                            
                            fn_name = part.function_call.name
                            console.print(Panel(f"⚙️ [bold cyan]ACTION:[/bold cyan] Calling `{fn_name}`...", border_style="cyan"))
                            live.start()

            # Final response (if there is text remaining after the tools)
            if current_thought.strip():
                console.print(Panel(Markdown(current_thought), title="[bold magenta]Final Response[/]", border_style="magenta"))

            if hasattr(chunk, 'usage_metadata'):
                console.print(f"[dim]Tokens: {chunk.usage_metadata.total_token_count}[/dim]", justify="right")

        except KeyboardInterrupt: break
        except Exception as e: console.print(f"[bold red]Error:[/bold red] {e}")

if __name__ == "__main__":
    run()