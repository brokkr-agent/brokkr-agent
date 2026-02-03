-- delete.scpt
-- Moves a message to trash
-- Args: message_id
-- Output: JSON with status

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Message ID required\"}"
    end if

    set msgId to item 1 of argv as integer

    tell application "Mail"
        try
            set theMsg to message id msgId
            set msgSubject to subject of theMsg
            set msgMailbox to name of mailbox of theMsg

            -- Move to trash
            delete theMsg

            return "{\"status\": \"deleted\", \"id\": " & msgId & ", \"subject\": \"" & my escapeJSON(msgSubject) & "\", \"from_mailbox\": \"" & my escapeJSON(msgMailbox) & "\"}"

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
