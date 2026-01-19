# GitHub Copilot Configuration

This directory contains configuration for GitHub Copilot coding agent to help it better understand and work with this repository.

## Files Overview

### `copilot-instructions.md`
Repository-wide instructions that provide context to GitHub Copilot about:
- Architecture and project structure
- Development commands and workflows
- Coding conventions and patterns
- Code quality standards
- Security guidelines
- Boundaries and restrictions

This file acts as "onboarding documentation" for the AI coding assistant, similar to what you would provide to a new team member.

### `skills/`
Agent Skills directory containing specialized instruction sets for specific tasks:

#### `skills/react-ui-patterns/`
Modern React UI patterns for loading states, error handling, and data fetching. Copilot will automatically use this skill when working on React components.

**When to use**: Building UI components, handling async data, or managing UI states.

## How Copilot Uses These Files

1. **copilot-instructions.md**: Automatically loaded for all Copilot interactions in this repository
2. **Agent Skills**: Copilot automatically detects and loads relevant skills based on the task context

## Adding New Skills

To add a new Agent Skill:

1. Create a subdirectory under `.github/skills/` with a descriptive name (e.g., `api-testing`)
2. Add a `SKILL.md` file with YAML frontmatter:
   ```yaml
   ---
   name: skill-name-in-kebab-case
   description: Clear description of what the skill does and when to use it
   ---
   ```
3. Add your detailed instructions, examples, and guidelines in Markdown below the frontmatter
4. Optionally include scripts, examples, or other resources in the skill directory

## Best Practices

- Keep instructions clear, specific, and actionable
- Provide concrete examples rather than abstract rules
- Update instructions as the project evolves
- Be explicit about what NOT to do (boundaries and restrictions)
- Include commands that Copilot should run (tests, builds, linters)

## References

- [GitHub Copilot Coding Agent Documentation](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-coding-agent-in-your-ide)
- [About Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [Community Skills Repository](https://github.com/github/awesome-copilot)
