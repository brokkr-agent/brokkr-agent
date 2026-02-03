-- list-inbox.scpt
-- Lists recent inbox messages with metadata
-- Output: JSON array of message objects

on run argv
    set maxCount to 20
    if (count of argv) > 0 then
        set maxCount to item 1 of argv as integer
    end if

    set jsonOutput to "["
    set isFirst to true

    tell application "Mail"
        set inboxMessages to messages of inbox
        set msgCount to count of inboxMessages

        if msgCount > maxCount then
            set msgCount to maxCount
        end if

        repeat with i from 1 to msgCount
            set theMsg to item i of inboxMessages

            set msgId to id of theMsg
            set msgSubject to subject of theMsg
            set msgSender to sender of theMsg
            set msgDate to date received of theMsg
            set msgRead to read status of theMsg
            set msgFlagged to flagged status of theMsg

            -- Escape quotes in subject and sender
            set msgSubject to my escapeJSON(msgSubject)
            set msgSender to my escapeJSON(msgSender)

            -- Format date as ISO string
            set msgDateStr to my formatDate(msgDate)

            if not isFirst then
                set jsonOutput to jsonOutput & ","
            end if
            set isFirst to false

            set jsonOutput to jsonOutput & "{" & ¬
                "\"id\":" & msgId & "," & ¬
                "\"subject\":\"" & msgSubject & "\"," & ¬
                "\"sender\":\"" & msgSender & "\"," & ¬
                "\"date\":\"" & msgDateStr & "\"," & ¬
                "\"read\":" & msgRead & "," & ¬
                "\"flagged\":" & msgFlagged & ¬
                "}"
        end repeat
    end tell

    set jsonOutput to jsonOutput & "]"
    return jsonOutput
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

on formatDate(theDate)
    set y to year of theDate
    set m to month of theDate as integer
    set d to day of theDate
    set h to hours of theDate
    set min to minutes of theDate
    set s to seconds of theDate

    -- Zero-pad values
    if m < 10 then set m to "0" & m
    if d < 10 then set d to "0" & d
    if h < 10 then set h to "0" & h
    if min < 10 then set min to "0" & min
    if s < 10 then set s to "0" & s

    return "" & y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
end formatDate
