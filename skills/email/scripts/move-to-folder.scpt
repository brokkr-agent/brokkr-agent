-- move-to-folder.scpt
-- Moves a message to a specified mailbox
-- Args: message_id, mailbox_name, [account_name]
-- Output: JSON with status, id, from, to

on run argv
    if (count of argv) < 2 then
        return "{\"error\": \"Required: message_id, mailbox_name\"}"
    end if

    set msgId to item 1 of argv as integer
    set targetMailbox to item 2 of argv
    set targetAccount to "iCloud"

    if (count of argv) > 2 then
        set targetAccount to item 3 of argv
    end if

    tell application "Mail"
        try
            set theMsg to message id msgId
            set origMailbox to name of mailbox of theMsg

            -- Find target mailbox
            set destMailbox to mailbox targetMailbox of account targetAccount

            -- Move message
            move theMsg to destMailbox

            return "{\"status\": \"moved\", \"id\": " & msgId & ", \"from\": \"" & my escapeJSON(origMailbox) & "\", \"to\": \"" & my escapeJSON(targetMailbox) & "\"}"

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if c is (ASCII character 10) then
            set output to output & "\\n"
        else if c is (ASCII character 13) then
            set output to output & "\\r"
        else if c is (ASCII character 9) then
            set output to output & "\\t"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
