# Aditya Kulkarni - Portfolio

A new review edition of my portfolio. This branch is a preview, not a production update.

Five pages: Home, Projects, Academics, Beyond the Terminal and Community. Plain HTML, CSS and JavaScript. No framework, runtime dependencies, backend, analytics or external script requests.

## Design and behavior

- An original contour portrait derived from my existing portfolio imagery, with a lightweight Canvas 2D animation and an SVG fallback.
- Native scrolling, large project previews and a keyboard-accessible menu.
- Reduced-motion support, a visible pause control and no blocking loading screen.
- Project screenshots are previews, not embedded applications. Each opens the real project or its source.
- The Monte Carlo illustration is a fixed visual; its displayed pi estimate is a measured result documented in the mc-java repository, not a live run.
- Contact links go to my public GitHub and LinkedIn profiles. No contact form, visitor tracking or personal-data collection.

## Local preview

Serve the directory with any static HTTP server. No install or build step.

Run the basic source checks with `python3 tests/check_site.py`.

## Fonts and images

Doto and IBM Plex Mono are self-hosted subsets, under the SIL Open Font License. Their license files are in `assets/review/`. Project screenshots show my published projects. Other visuals are authored for this portfolio.

## Author

Aditya Kulkarni / [Aditya2375](https://github.com/Aditya2375)
