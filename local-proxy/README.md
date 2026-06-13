# Local Proxy

This MVP uses the local A\W service runtime.

The project does not reimplement Claude's web protocol. The setup script installs the local runtime into a Python virtual environment and writes a locked-down `.env`:

- `HOST=127.0.0.1`
- `PORT=5201`
- `API_KEYS=<generated local key>`
- `ADMIN_API_KEYS=<generated local admin key>`
- `DATA_FOLDER=local-proxy/data`

Start it with:

```bash
./scripts/start-proxy.sh
```

Configure Claude Free cookie accounts from the A\W sidebar settings.
