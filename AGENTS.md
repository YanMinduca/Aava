<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture
- Store editable public information in the singleton site_content row; resolve public reads through a publishable server function and shared Query options for SSR.
- Use database-backed role checks and atomic role assignment RPC for leadership access; only CEO grants or revokes Pastor Presidente.
- Keep prayer requests owner/leadership-only through RLS; public pages never fetch private prayer data on the server.
- Store optimized homepage photo data in public site content; browser resizing limits payloads and avoids exposing private storage.
