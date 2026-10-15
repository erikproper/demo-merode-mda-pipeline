# Cloudflare Tunnel - mda.tlolab.com

Since `books.tlolab.com` is already running, only a new `ingress` entry has to be
added to the existing tunnel config.

## 1. Locate the existing config

```bash
# Usually here:
cat ~/.cloudflared/config.yml
# or:
cat /etc/cloudflared/config.yml
```

## 2. Add the entry

Insert the `mda.tlolab.com` block **before** the catch-all `service: http_status:404`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  # Existing - books
  - hostname: books.tlolab.com
    service: http://localhost:<books-port>

  # New - MDA pipeline API
  - hostname: mda.tlolab.com
    service: http://localhost:3000

  # Catch-all (must always come last)
  - service: http_status:404
```

## 3. Create the DNS entry in Cloudflare

```bash
cloudflared tunnel route dns <tunnel-name-or-id> mda.tlolab.com
```

Or in the Cloudflare dashboard:
- **Zero Trust -> Networks -> Tunnels -> your tunnel -> Public Hostname -> Add**
- Subdomain: `mda`, Domain: `tlolab.com`, Service: `HTTP`, URL: `localhost:3000`

## 4. Restart the tunnel

```bash
# As a systemd service (probably your setup):
sudo systemctl restart cloudflared

# Or if running as a Docker container:
docker restart cloudflared
```

## 5. Test

```bash
curl https://mda.tlolab.com/health
# -> {"status":"ok","service":"api-server","broker":"mqtt-broker:1883"}

curl -X POST https://mda.tlolab.com/api/model \
     -H "Content-Type: application/json" \
     -d @mda-agents/tests/rent-a-car-demo.json
# -> {"ok":true,"artefactID":"model.demo.raw","timestamp":"..."}
```
