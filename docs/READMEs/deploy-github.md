# GitHub-based Deployment for PAMPAX Oak

Since npm publishing requires native dependencies that may fail in some environments, we can deploy directly from GitHub using npx.

## Method 1: Direct GitHub Repository (Recommended)

Users can install directly from your GitHub fork:

```bash
npx github:casual-oak/pampax
```

## Method 2: GitHub with Package.json

Create a minimal package.json in the repository root that points to the main entry:

```json
{
  "name": "@casualclark/pampax",
  "version": "1.15.1-oak.1",
  "bin": {
    "pampax-oak": "./src/mcp-server.js"
  },
  "files": [
    "src/",
    "README.md",
    "package.json"
  ]
}
```

## Method 3: GitHub Release

1. Create a release on GitHub
2. Users install with:
```bash
npx https://github.com/casual-oak/pampax#v1.15.1-oak.1
```

## Configuration Examples

Update all config files to use GitHub-based installation:

### Claude Desktop
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": [
        "github:casual-oak/pampax",
        "/path/to/your/project"
      ]
    }
  }
}
```

### OpenCode
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": [
        "github:casual-oak/pampax",
        "/home/oakley/mcps/pampax"
      ]
    }
  }
}
```

## Benefits of GitHub Deployment

- No native dependency compilation issues
- Always latest version from main branch
- No npm account required
- Works in restricted environments
- Easy versioning with git tags

## Next Steps

1. Test `npx github:casual-oak/pampax` command
2. Update documentation with GitHub installation method
3. Create git tags for releases: `git tag v1.15.1-oak.1`
4. Push tags to GitHub: `git push --tags`