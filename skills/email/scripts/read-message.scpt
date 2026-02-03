-- read-message.scpt
-- Reads full content of a specific message by ID
-- Args: message_id
-- Output: JSON object with full message details

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Message ID required\"}"
    end if

    set msgId to item 1 of argv as integer

    try
        tell application "Mail"
            -- Find message by ID in inbox
            set theMessages to (messages of inbox whose id is msgId)
            if (count of theMessages) is 0 then
                error "Message not found with ID " & msgId
            end if
            set theMsg to item 1 of theMessages

            set msgSubject to subject of theMsg
            set msgSender to sender of theMsg
            set msgDateSent to date sent of theMsg
            set msgDateRecv to date received of theMsg
            set msgRead to read status of theMsg
            set msgFlagged to flagged status of theMsg
            set msgContent to content of theMsg
            set msgMailbox to name of mailbox of theMsg

            -- Get recipients
            set toList to ""
            repeat with r in to recipients of theMsg
                if toList is not "" then set toList to toList & ", "
                set toList to toList & (address of r)
            end repeat

            -- Get CC recipients
            set ccList to ""
            repeat with r in cc recipients of theMsg
                if ccList is not "" then set ccList to ccList & ", "
                set ccList to ccList & (address of r)
            end repeat

            -- Get attachments
            set attachList to ""
            repeat with a in mail attachments of theMsg
                if attachList is not "" then set attachList to attachList & ", "
                set attachList to attachList & (name of a)
            end repeat

            -- Mark as read
            set read status of theMsg to true
        end tell

        -- Escape strings (outside tell block for proper scoping)
        set msgSubject to my escapeJSON(msgSubject)
        set msgSender to my escapeJSON(msgSender)
        set msgContent to my escapeJSON(msgContent)
        set toList to my escapeJSON(toList)
        set ccList to my escapeJSON(ccList)
        set attachList to my escapeJSON(attachList)
        set msgMailbox to my escapeJSON(msgMailbox)

        set jsonOutput to "{" & ¬
            "\"id\":" & msgId & "," & ¬
            "\"subject\":\"" & msgSubject & "\"," & ¬
            "\"sender\":\"" & msgSender & "\"," & ¬
            "\"to\":\"" & toList & "\"," & ¬
            "\"cc\":\"" & ccList & "\"," & ¬
            "\"date_sent\":\"" & my formatDate(msgDateSent) & "\"," & ¬
            "\"date_received\":\"" & my formatDate(msgDateRecv) & "\"," & ¬
            "\"mailbox\":\"" & msgMailbox & "\"," & ¬
            "\"read\":" & msgRead & "," & ¬
            "\"flagged\":" & msgFlagged & "," & ¬
            "\"attachments\":\"" & attachList & "\"," & ¬
            "\"content\":\"" & msgContent & "\"" & ¬
            "}"

        return jsonOutput

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

on formatDate(theDate)
    set y to year of theDate
    set m to month of theDate as integer
    set d to day of theDate
    set h to hours of theDate
    set min to minutes of theDate
    set s to seconds of theDate

    if m < 10 then set m to "0" & m
    if d < 10 then set d to "0" & d
    if h < 10 then set h to "0" & h
    if min < 10 then set min to "0" & min
    if s < 10 then set s to "0" & s

    return "" & y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
end formatDate
