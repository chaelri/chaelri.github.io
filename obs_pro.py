import os
import re
import subprocess
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.live import Live

# Setup beautiful terminal output
console = Console()
app = FastAPI()

# Allow Browser connection (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def run_local_cmd(cmd):
    """Safely execute npm or pip commands with forced local paths."""
    console.print(Panel(f"[bold cyan]AI Suggests Command:[/bold cyan]\n[yellow]{cmd}[/yellow]", border_style="yellow"))
    confirm = input("Execute locally? (y/n): ")
    if confirm.lower() == 'y':
        console.print("[dim]Running with local permissions...[/dim]")
        
        local_env = os.environ.copy()
        npm_base = os.path.expanduser("~/Documents/.npm_local")
        os.makedirs(npm_base, exist_ok=True)
        
        if cmd.startswith("npm"):
            local_env["npm_config_cache"] = os.path.join(npm_base, "cache")
            local_env["npm_config_prefix"] = os.path.join(npm_base, "global")
            local_env["npm_config_init_module"] = os.path.join(npm_base, "config")
            local_env["NODE_OPTIONS"] = "--no-warnings"

        try:
            subprocess.run(cmd, shell=True, env=local_env)
            console.print("[bold green]✅ Command Execution Finished.[/bold green]")
        except Exception as e:
            console.print(f"[bold red]❌ Failed to run command: {e}[/bold red]")

@app.post("/sync")
async def sync_from_browser(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    
    if not text:
        return {"status": "empty"}

    console.print("\n[bold magenta]───────────────── 👁️ AI OBSERVATION ─────────────────[/bold magenta]")

    # 1. Handle Full Files (Complete replacement)
    # This regex looks for code blocks with filenames, e.g., ```python:main.py
    blocks = re.findall(r'```(?:\w+)?[:\s]?([\w\./-]+\.\w+)\n(.*?)\n```', text, re.DOTALL)
    
    for filename, content in blocks:
        console.print(f"[bold green]📂 UPDATING FILE:[/bold green] [white]{filename}[/white]")
        
        # Display preview
        syntax = Syntax(content[:300] + ("..." if len(content) > 300 else ""), "python", theme="monokai")
        console.print(Panel(syntax, title=filename, border_style="blue"))
        
        # Ensure directory exists
        dir_name = os.path.dirname(filename)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
            
        # Write full file content (Complete replacement)
        with open(filename, "w") as f:
            f.write(content.strip())
        console.print(f"[dim]Saved to {os.path.abspath(filename)}[/dim]")

    # 2. Handle Commands (Deduplicated list)
    cmds = list(set(re.findall(r'`(npm .*?|pip3? .*?)`', text)))
    for c in cmds:
        run_local_cmd(c)

    return {"status": "synced"}

if __name__ == "__main__":
    console.print(Panel.fit(
        "[bold green]PRO OBSERVER ENGINE ONLINE[/bold green]\n"
        "[white]Listening for Gemini AI Studio Live Feed...[/white]", 
        border_style="cyan"
    ))
    uvicorn.run(app, host="0.0.0.0", port=9000, log_level="error")