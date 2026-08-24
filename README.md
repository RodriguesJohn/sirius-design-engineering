# Sirius × Ritual Goods. The Widget Swap

Design engineering challenge: keep Deskly, replace the store widget.

Sirius sits on the Ritual Goods storefront, answers from the real help center, knows the logged-in customer, and only files a Deskly ticket when a human is needed. The agent’s reply comes back in the same chat.

```
store/          Ritual Goods storefront. Do not rebuild
widget/         Sirius widget (the work)
  src/          React app: chrome, brain, Deskly client
  styles/       Brand tokens + chrome
  widget.js     Built bundle (vite). What the store loads
helpdesk/       Deskly (inbox + API)
data/           Customers, orders, historical chats
brand/          Sirius brand guidelines
examples/       Walking-skeleton widget (not the submission)
```

## Run

Build the widget once (from `widget/`):

```bash
cd widget && npm install && npm run build
```

Then from the repo root, two terminals:

```bash
python3 helpdesk/deskly.py
```

```bash
python3 -m http.server 8765
```

Then open:

- Store + widget → [http://localhost:8765/store/store.html](http://localhost:8765/store/store.html)
- Agent inbox → [http://localhost:8099](http://localhost:8099)

Pick a customer in the store dropdown. Chat in Sirius. Replies typed in Deskly land back in the widget.
