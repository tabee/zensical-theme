---
hero:
  title: zensical-theme
  text: Neon colours for Zensical. Deep purple, pink to cyan, and a strange attractor on the start page.
  buttons:
    - text: Read the README
      href: https://github.com/tabee/zensical-theme
    - text: Zensical
      href: https://zensical.org/
---
# zensical-theme

A page that shows the common elements with the neon colours. Headings,
links, code and admonitions are what the style sheet changes; the layout is
plain Zensical.

## Text and links

Body text is soft lavender on deep purple (dark) or deep purple on pale
lavender (light); flip the toggle in the header. Links are cyan and glow pink
on hover, like [this one](https://zensical.org/).
Inline code such as `kubectl get pods -A` sits on a slightly lighter box.

## Code blocks

```bash title="docs/build.sh"
#!/usr/bin/env bash
set -euo pipefail
zensical build --strict -f zensical.toml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: docs
spec:
  replicas: 1
```

## Admonitions

!!! note "Note"
    Admonitions use the accent colour where the theme asks for it.

!!! warning "Warning"
    Both colour schemes are styled. `slate` is the neon-on-dark look, `default`
    the same hues on a light background.

??? tip "Collapsed details"
    Details blocks work too.

## Tabs and tables

=== "Zensical"

    ```toml
    [project.theme]
    custom_dir = "overrides"
    ```

=== "Shell"

    ```bash
    git clone https://github.com/tabee/zensical-theme.git
    ```

| Element | Colour |
|---------|--------|
| Heading 1 | gradient pink to cyan |
| Heading 2 | pink with purple rule |
| Links | cyan, pink on hover |
| Code border | purple |

## Task list

- [x] Dark base
- [x] Neon gradient in the header
- [ ] Your project
