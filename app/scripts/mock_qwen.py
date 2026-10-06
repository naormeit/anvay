"""Fake OpenAI-compatible endpoint that returns canned Qwen-style tool calls, keyed on the user's text."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

CANNED = {
    "mom": {"amount": 5000, "currency": "INR", "recipient": "Mom"},
    "dollars": {"amount": 50, "currency": "USD", "recipient": None},
    "huge": {"amount": 2000000, "currency": "INR", "recipient": "Ravi"},
    "tiny": {"amount": 0.001, "currency": "USD", "recipient": None},
    "nocurrency": {"amount": 100, "currency": "EUR", "recipient": None},
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        with open("last_request.json", "w") as f:
            json.dump({"auth": self.headers.get("Authorization", "")[:10], "body": body}, f)
        text = body["messages"][-1]["content"].lower()
        message = {"role": "assistant", "content": None}
        if "badjson" in text:
            message["tool_calls"] = [{"type": "function", "function": {"name": "draft_payment", "arguments": "{oops"}}]
        else:
            args = next((v for k, v in CANNED.items() if k in text), None)
            if args:
                message["tool_calls"] = [{"type": "function", "function": {"name": "draft_payment", "arguments": json.dumps(args)}}]
            else:
                message["content"] = "I can only help you send money."
        out = json.dumps({"choices": [{"message": message}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)


HTTPServer(("127.0.0.1", 8599), Handler).serve_forever()
