-- compose.scpt
-- Creates and optionally sends a new email
-- Args: to_address, subject, body, [send_now: true/false]
-- Output: JSON with status

on run argv
    if (count of argv) < 3 then
        return "{\"error\": \"Required: to_address, subject, body\"}"
    end if

    set toAddress to item 1 of argv
    set msgSubject to item 2 of argv
    set msgBody to item 3 of argv
    set sendNow to false

    if (count of argv) > 3 then
        if item 4 of argv is "true" then
            set sendNow to true
        end if
    end if

    tell application "Mail"
        try
            set newMsg to make new outgoing message with properties {subject:msgSubject, content:msgBody, visible:not sendNow}

            tell newMsg
                make new to recipient at end of to recipients with properties {address:toAddress}
            end tell

            if sendNow then
                send newMsg
                return "{\"status\": \"sent\", \"to\": \"" & toAddress & "\", \"subject\": \"" & my escapeJSON(msgSubject) & "\"}"
            else
                return "{\"status\": \"draft\", \"to\": \"" & toAddress & "\", \"subject\": \"" & my escapeJSON(msgSubject) & "\", \"note\": \"Draft created and opened in Mail\"}"
            end if

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
