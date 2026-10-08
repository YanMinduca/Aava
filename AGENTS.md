## Application architecture
- Store editable public information in the singleton site_content row; resolve public reads through a publishable server function and shared Query options for SSR.
- Use database-backed role checks and atomic role assignment RPC for leadership access; only CEO grants or revokes Pastor Presidente.
- Keep prayer requests owner/leadership-only through RLS; public pages never fetch private prayer data on the server.
- Store optimized homepage photo data in public site content; browser resizing limits payloads and avoids exposing private storage.
