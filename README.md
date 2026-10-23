# Docker over TCP — Podman Desktop extension

Connect [Podman Desktop](https://podman-desktop.io) to Docker engines that are only reachable via `tcp://`, for example Docker Engine running inside WSL 2 and exposed on `tcp://127.0.0.1:2375`.

## Why

Podman Desktop can only talk to container engines through a local Unix socket or Windows named pipe. Docker contexts and `DOCKER_HOST` values using `tcp://` are skipped. If you run Docker Engine in WSL without Docker Desktop, the Containers, Images and Volumes views stay empty ("No Container Engine").

## How it works

For each configured `tcp://` endpoint, the extension:

1. opens a private local pipe (`\\.\pipe\pd-docker-tcp-<name>` on Windows, a Unix socket in the temp dir elsewhere),
2. relays every connection on that pipe to the TCP address,
3. registers the pipe as a Docker container connection in Podman Desktop,
4. pings `/_ping` every 5 seconds and shows the connection as started or stopped.

No external processes, no admin rights, no changes to your Docker setup.

## Requirements

- Podman Desktop 1.20 or newer
- A Docker Engine reachable on a `tcp://` address (see [Docker in WSL](#docker-in-wsl-expose-the-engine-on-localhost-only) below)

## Install

There are three ways to install the extension. Option 1 and option 2 load it automatically every time Podman Desktop starts. Option 3 is for working on the extension.

### 1. From the image (recommended)

In Podman Desktop: **Extensions → Install custom…** and enter:

```
ghcr.io/gasparovicm/podman-desktop-docker-tcp:latest
```

To build and publish the image yourself (the `Containerfile` follows the Podman Desktop extension image layout):

```bash
podman build -t ghcr.io/<you>/podman-desktop-docker-tcp:0.1.0 .
podman push ghcr.io/<you>/podman-desktop-docker-tcp:0.1.0
```

### 2. Copy into the plugins folder (no registry needed)

At startup, Podman Desktop loads every extension folder in its plugins directory:

| OS | Plugins directory |
|---|---|
| Windows | `%USERPROFILE%\.local\share\containers\podman-desktop\plugins` |
| macOS / Linux | `~/.local/share/containers/podman-desktop/plugins` |

1. Quit Podman Desktop completely: **tray icon → Quit**. Closing the window is not enough.
2. Copy the extension files into a `docker-tcp` subfolder.

   PowerShell, run from this repository:

   ```powershell
   $dest = "$env:USERPROFILE\.local\share\containers\podman-desktop\plugins\docker-tcp"
   New-Item -ItemType Directory -Force $dest | Out-Null
   Copy-Item package.json, extension.js, icon.png, LICENSE, README.md $dest -Force
   ```

   Bash (Git Bash, macOS, Linux), run from this repository:

   ```bash
   dest="${USERPROFILE:-$HOME}/.local/share/containers/podman-desktop/plugins/docker-tcp"
   mkdir -p "$dest"
   cp package.json extension.js icon.png LICENSE README.md "$dest/"
   ```

3. Start Podman Desktop. **Docker over TCP** now appears under **Extensions → Installed**.

**To update:** quit Podman Desktop, run the copy again, then start it.
**To uninstall:** quit Podman Desktop and delete the `docker-tcp` folder.

### 3. From source (development mode)

1. Clone or download this repository.
2. **Settings → Preferences → Extensions →** enable **Development Mode**.
3. **Extensions → Local Extensions → Add a local folder extension…** and select the folder.

Use this only while you are editing the extension. Depending on your Podman Desktop version, you may have to add the folder again after every restart.

Podman Desktop loads an extension ID only once. If the extension is already installed (option 1 or 2), adding the folder fails with:

```
Extension with id gasparovicm.docker-tcp is already loaded globally. It cannot be added as a development folder.
```

**Switching to development mode:**

1. Quit Podman Desktop.
2. Remove the installed copy: delete the `plugins\docker-tcp` folder (option 2), or uninstall the extension under **Extensions → Installed** (option 1).
3. Start Podman Desktop and add the folder under **Local extensions**.

**Switching back:** remove the folder from **Local extensions**, quit Podman Desktop, and install it again with option 1 or 2.

## Configure

**Settings → Preferences → Docker over TCP → Endpoints**

Default: `WSL Docker=tcp://127.0.0.1:2375`

Multiple engines are separated by `;`:

```
WSL Docker=tcp://127.0.0.1:2375; Build server=tcp://127.0.0.1:23750
```

Changes apply immediately.

## Docker in WSL: expose the engine on localhost only

In `/etc/docker/daemon.json` inside your WSL distro:

```json
{ "hosts": ["unix:///var/run/docker.sock", "tcp://127.0.0.1:2375"] }
```

If your distro's `docker.service` passes `-H fd://`, override it so the `hosts` setting is used:

```bash
sudo systemctl edit docker
# add:
# [Service]
# ExecStart=
# ExecStart=/usr/bin/dockerd
sudo systemctl restart docker
```

Use `tcp://127.0.0.1:2375`, not `tcp://localhost:2375`: Node.js may resolve `localhost` to IPv6 `::1`, which WSL usually does not forward.

## Security

Plain `tcp://` on port 2375 has **no authentication and no encryption**. Anyone who can reach it effectively has root on the Docker host. Only bind it to `127.0.0.1`. For remote engines, use an SSH tunnel and point the extension at the local end:

```bash
ssh -N -L 23750:/var/run/docker.sock user@server
```

The local pipe created by the extension is only accessible to your own user.

## Troubleshooting

**? → Troubleshooting → Logs**, filter for `docker-tcp`. Each endpoint logs one line when it starts, or an error explaining why it could not.

| Symptom | Check |
|---|---|
| Extension missing after restart | You installed it in development mode (option 3). Use option 1 or 2 instead. With option 2, check that `package.json` is directly inside `plugins\docker-tcp`, not in a subfolder below it. |
| Connection shows as stopped | From Windows, run `curl http://127.0.0.1:2375/_ping`. It should print `OK`. If it doesn't, Docker in WSL is not listening on TCP, or WSL is not running. |
| "Add Extension Failed: … is already loaded globally" | The extension is already installed. To work on it in development mode, see [Switching to development mode](#3-from-source-development-mode). |
| Works with `localhost` in the CLI but not here | Use `127.0.0.1` in the endpoint, not `localhost` (see above). |

## License

Apache-2.0
