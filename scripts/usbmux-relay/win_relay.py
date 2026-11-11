# Windows side: pipe stdin/stdout to Apple's usbmuxd on 127.0.0.1:27015.
import socket, sys, threading, os
s = socket.create_connection(("127.0.0.1", 27015))
def up():
    while True:
        d = os.read(0, 65536)
        if not d:
            break
        s.sendall(d)
    s.shutdown(socket.SHUT_WR)
threading.Thread(target=up, daemon=True).start()
out = sys.stdout.buffer
while True:
    d = s.recv(65536)
    if not d:
        break
    out.write(d); out.flush()
