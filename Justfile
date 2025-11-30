# Justfile for ustate

# Default recipe to display help information
default:
    @just --list

# Run all tests
test:
    deno test --allow-all

# Run tests in watch mode
test-watch:
    deno test --allow-all --watch

# Run counter example
example-counter:
    deno run --allow-all examples/counter.ts

# Run toggle example
example-toggle:
    deno run --allow-all examples/toggle.ts

# Run text editor example
example-text-editor:
    deno run --allow-all examples/text-editor.ts

# Run traffic light example
example-traffic-light:
    deno run --allow-all examples/traffic-light.ts

# Run media player example
example-media-player:
    deno run --allow-all examples/media-player.ts

# Run fetch data example
example-fetch-data:
    deno run --allow-all examples/fetch-data.ts

# Run timer example
example-timer:
    deno run --allow-all examples/timer.ts

# Run all examples
examples: example-counter example-toggle example-text-editor example-traffic-light example-media-player example-fetch-data example-timer

# Check TypeScript types
check:
    deno check src/mod.ts

# Format code
fmt:
    deno fmt

# Lint code
lint:
    deno lint

# Run all quality checks
qa: check lint test

# Publish to JSR (dry run)
publish-dry:
    deno publish --dry-run

# Publish to JSR
publish:
    deno publish

# Clean generated files
clean:
    rm -rf .deno/
