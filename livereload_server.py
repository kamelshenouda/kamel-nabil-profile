#!/usr/bin/env python3
"""
Live-reload HTTP server for profile.html development.
Watches for file changes and pushes reload signal via SSE.
"""
import os, time, threading, hashlib
from http.server import HTTPServer, SimpleHTTPRequestHandler

WATCH_FILE = "profile.html"
clients = []
last_hash = None

def file_hash():
    try:
        with open(WATCH_FILE, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    except:
        return None

def watcher():
    global last_hash
    last_hash = file_hash()
    while True:
        time.sleep(0.5)
        h = file_hash()
        if h and h != last_hash:
            last_hash = h
            for q in list(clients):
                try:
                    q.put("reload")
                except:
                    pass

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silence access logs

    def do_GET(self):
        if self.path == "/__livereload__":
            import queue
            q = queue.Queue()
            clients.append(q)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                while True:
                    try:
                        msg = q.get(timeout=30)
                        self.wfile.write(b"data: reload\n\n")
                        self.wfile.flush()
                    except:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except:
                clients.remove(q)
            return
        super().do_GET()

if __name__ == "__main__":
    t = threading.Thread(target=watcher, daemon=True)
    t.start()
    print("Live-reload server: http://localhost:8080/profile.html")
    print("Watching profile.html for changes...")
    HTTPServer(("", 8080), Handler).serve_forever()
