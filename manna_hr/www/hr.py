"""The dashboard's page, at `/hr` and at every path under it.

`hr.html` beside this file is written by `npm run build` from the client's
built `index.html` — see client/vite.config.js. Nothing is edited here by hand:
the script tag in it names a hashed filename, so a hand-edit is a file that
disagrees with the bundle it is supposed to load.

`no_cache` because the filename in that script tag changes on every build, and
a cached shell pointing at a bundle that no longer exists is a white screen
with a 404 in the console — the one failure mode of this arrangement that looks
like nothing at all. The page itself is two hundred bytes; there is nothing
here worth caching.

Guest gets the shell, and that is deliberate rather than an oversight. It holds
no data — the app asks the site who is signed in and draws its own sign-in form
for anybody who is not. What a person may then read is what their roles say,
decided on the site, as them. See client/README.md and CLAUDE.md §1.
"""

no_cache = 1
