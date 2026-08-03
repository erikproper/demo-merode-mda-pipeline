# Cloudflare Tunnel — mda.tlolab.com

Da `books.tlolab.com` bereits läuft, muss nur ein neuer `ingress`-Eintrag in der
bestehenden Tunnel-Config ergänzt werden.

## 1. Bestehende Config finden

```bash
# Üblicherweise hier:
cat ~/.cloudflared/config.yml
# oder:
cat /etc/cloudflared/config.yml
```

## 2. Eintrag ergänzen

Füge den `mda.tlolab.com`-Block **vor** dem catch-all `service: http_status:404` ein:

```yaml
tunnel: <deine-tunnel-id>
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  # Bestehend — books
  - hostname: books.tlolab.com
    service: http://localhost:<books-port>

  # Neu — MDA Pipeline API
  - hostname: mda.tlolab.com
    service: http://localhost:3000

  # Catch-all (muss immer am Ende stehen)
  - service: http_status:404
```

## 3. DNS-Eintrag in Cloudflare anlegen

```bash
cloudflared tunnel route dns <tunnel-name-oder-id> mda.tlolab.com
```

Oder im Cloudflare Dashboard:
- **Zero Trust → Networks → Tunnels → dein Tunnel → Public Hostname → Add**
- Subdomain: `mda`, Domain: `tlolab.com`, Service: `HTTP`, URL: `localhost:3000`

## 4. Tunnel neu starten

```bash
# Als systemd-Service (wahrscheinlich dein Setup):
sudo systemctl restart cloudflared

# Oder falls als Docker-Container:
docker restart cloudflared
```

## 5. Testen

```bash
curl https://mda.tlolab.com/health
# → {"status":"ok","service":"api-server","broker":"mqtt-broker:1883"}

curl -X POST https://mda.tlolab.com/api/model \
     -H "Content-Type: application/json" \
     -d @mda-agents/tests/rent-a-car-demo.json
# → {"ok":true,"artefactID":"model.demo.raw","timestamp":"..."}
```
