# Publishing Guide

This guide explains how to publish **ustate** to JSR (JavaScript Registry).

## Prerequisites

1. **GitHub Account** - JSR uses GitHub for authentication
2. **Deno Installed** - Required for publishing
3. **Package Ready** - All tests passing, code formatted

## Publishing Steps

### 1. Verify Package

Run a dry-run to check what will be published:

```bash
deno publish --dry-run
```

This will show you:
- All files that will be included
- Package name and version
- Any potential issues

### 2. Run Quality Checks

Before publishing, ensure everything is working:

```bash
# Run tests
deno test --allow-all

# Check types
deno check src/mod.ts

# Format code
deno fmt

# Lint code
deno lint
```

Or use the Justfile:

```bash
just qa
```

### 3. Update Version

Edit `deno.json` and update the version number following [semantic versioning](https://semver.org/):

```json
{
  "version": "0.1.0"  // Update this
}
```

### 4. Authenticate with JSR

On first publish, you'll need to authenticate:

```bash
deno publish
```

This will:
1. Open your browser
2. Ask you to sign in with GitHub
3. Grant permissions to JSR
4. Return to the terminal

### 5. Publish

After authentication, the package will be published automatically. For subsequent publishes:

```bash
deno publish
```

### 6. Verify Publication

Visit your package page:

```
https://jsr.io/@nullstyle/ustate
```

Check that:
- Documentation is generated correctly
- Examples are visible
- Version is correct

## Package Scope

The package is published under the `@nullstyle` scope. To use a different scope:

1. Update `deno.json`:
   ```json
   {
     "name": "@yourscope/ustate"
   }
   ```

2. Update README.md with the new import paths

## Versioning Strategy

Follow semantic versioning:

- **Patch** (0.1.x) - Bug fixes, no API changes
- **Minor** (0.x.0) - New features, backward compatible
- **Major** (x.0.0) - Breaking changes

Since this is a compatibility library, major version changes should be coordinated with XState versions when possible.

## Publishing Checklist

Before each publish:

- [ ] All tests passing
- [ ] Code formatted (`deno fmt`)
- [ ] Code linted (`deno lint`)
- [ ] Types checked (`deno check src/mod.ts`)
- [ ] Examples working
- [ ] README updated
- [ ] Version bumped in `deno.json`
- [ ] CHANGELOG updated (if you create one)
- [ ] Dry-run successful (`deno publish --dry-run`)

## Troubleshooting

### "Slow types" Error

If you get a slow types error, it means some types in your public API are too complex. Simplify them or add explicit type annotations.

### Authentication Issues

If authentication fails:
1. Clear browser cache
2. Try incognito/private mode
3. Check GitHub permissions at https://github.com/settings/applications

### Version Already Published

JSR packages are immutable. If a version is already published, you must bump the version number.

## CI/CD Publishing

To publish from GitHub Actions:

1. Generate a JSR token at https://jsr.io/account/tokens
2. Add it as a GitHub secret named `JSR_TOKEN`
3. Create `.github/workflows/publish.yml`:

```yaml
name: Publish to JSR

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      - run: deno publish
        env:
          JSR_TOKEN: ${{ secrets.JSR_TOKEN }}
```

## Support

For JSR-specific issues, visit:
- JSR Documentation: https://jsr.io/docs
- JSR Discord: https://discord.gg/deno

For ustate issues, open an issue on GitHub.
