```bash
bun install

bun run dev
```

## Docker

```bash
docker build -t calendar .
docker run -p 3000:3000 --env-file .env calendar
```
