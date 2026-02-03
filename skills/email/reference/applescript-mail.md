# Apple Mail AppleScript Reference

## Official Documentation Sources

- [Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/)
- [Mail Rules with AppleScript](https://support.apple.com/guide/mail/use-scripts-as-rule-actions-mlhlp1171/mac)
- [AppleScript Mail Introduction - MacTech](http://preserve.mactech.com/articles/mactech/Vol.21/21.09/ScriptingMail/index.html)

## Key Limitations

1. **HTML Email Composition BROKEN** - `html content` property non-functional since macOS El Capitan (2015)
2. **Message ID Volatility** - IDs change when messages are moved between mailboxes
3. **Forward Command Bug** - Using `forward` may duplicate original message

## Recommended Timeout Wrapper

```applescript
with timeout of 600 seconds
    -- Long-running operations (read large message, search)
end timeout
```

## Memory Considerations (8GB RAM)

- Fetch messages in batches (max 50 at a time)
- Don't load full message content until requested
- Release references after processing
