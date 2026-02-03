-- reply.scpt
-- Creates a reply to a specific message
-- Args: message_id, body, [reply_all: true/false], [send_now: true/false]
-- Output: JSON with status

on run argv
    if (count of argv) < 2 then
        return "{\"error\": \"Required: message_id, body\"}"
    end if

    set msgId to item 1 of argv as integer
    set replyBody to item 2 of argv
    set replyAll to false
    set sendNow to false

    if (count of argv) > 2 then
        if item 3 of argv is "true" then
            set replyAll to true
        end if
    end if

    if (count of argv) > 3 then
        if item 4 of argv is "true" then
            set sendNow to true
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

            set origSubject to subject of theMsg
            set origSender to sender of theMsg

            if replyAll then
                set replyMsg to reply theMsg with opening window and reply to all
            else
                set replyMsg to reply theMsg with opening window
            end if

            -- Set the reply body (prepended to quoted original)
            set content of replyMsg to replyBody & return & return & content of replyMsg

            if sendNow then
                send replyMsg
            end if
        end tell

        -- Build JSON response outside tell block for proper scoping
        set escapedSender to my escapeJSON(origSender)
        set escapedSubject to my escapeJSON(origSubject)

        if sendNow then
            return "{\"status\": \"sent\", \"reply_to\": \"" & escapedSender & "\", \"subject\": \"Re: " & escapedSubject & "\", \"reply_all\": " & replyAll & "}"
        else
            return "{\"status\": \"draft\", \"reply_to\": \"" & escapedSender & "\", \"subject\": \"Re: " & escapedSubject & "\", \"reply_all\": " & replyAll & ", \"note\": \"Reply draft opened in Mail\"}"
        end if

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
