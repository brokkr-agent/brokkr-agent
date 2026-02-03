-- mark-read.scpt
-- Sets the read status of a message
-- Args: message_id, [read: true/false]
-- Output: JSON with new status

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Message ID required\"}"
    end if

    set msgId to item 1 of argv as integer
    set setRead to true

    if (count of argv) > 1 then
        if item 2 of argv is "false" then
            set setRead to false
        end if
    end if

    try
        tell application "Mail"
            -- Find message by ID in inbox
            set theMessages to (messages of inbox whose id is msgId)
            if (count of theMessages) is 0 then
                error "Message not found with ID " & msgId
            end if
            set theMsg to item 1 of theMessages

            set previousRead to read status of theMsg
            set read status of theMsg to setRead
        end tell

        return "{\"id\": " & msgId & ", \"read\": " & setRead & ", \"previous\": " & previousRead & "}"

    on error errMsg
        return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
    end try
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        set charCode to id of c
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if charCode is 10 then
            set output to output & "\\n"
        else if charCode is 13 then
            set output to output & "\\r"
        else if charCode is 9 then
            set output to output & "\\t"
        else if charCode < 32 then
            -- Skip other control characters
            set output to output & " "
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
