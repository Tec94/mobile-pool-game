# WSL side: serve /var/run/usbmuxd and forward each client through win_relay.py (Windows Python via WSL interop).
import os, socket, subprocess, sys, threading
PY, RELAY = sys.argv[1], sys.argv[2]
PATH = "/var/run/usbmuxd"
if os.path.exists(PATH):
    os.unlink(PATH)
srv = socket.socket(socket.AF_UNIX)
srv.bind(PATH); os.chmod(PATH, 0o666); srv.listen(16)
def handle(c):
    p = subprocess.Popen([PY, "-u", RELAY], stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
    def down():
        while True:
            d = p.stdout.read1(65536) if hasattr(p.stdout, "read1") else os.read(p.stdout.fileno(), 65536)
            if not d:
                break
            c.sendall(d)
        c.close()
    threading.Thread(target=down, daemon=True).start()
    while True:
        d = c.recv(65536)
        if not d:
            break
        p.stdin.write(d)
    p.stdin.close()
while True:
    c, _ = srv.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
