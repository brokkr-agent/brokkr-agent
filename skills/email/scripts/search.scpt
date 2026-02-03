-- search.scpt
-- Searches messages by various criteria
-- Args: query, [field: subject/sender/content/all], [mailbox: name or "all"], [max_results: number]
-- Output: JSON array of matching messages

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Search query required\"}"
    end if

    set searchQuery to item 1 of argv
    set searchField to "all"
    set searchMailbox to "all"
    set maxResults to 20

    if (count of argv) > 1 then
        set searchField to item 2 of argv
    end if
    if (count of argv) > 2 then
        set searchMailbox to item 3 of argv
    end if
    if (count of argv) > 3 then
        set maxResults to item 4 of argv as integer
    end if

    set jsonOutput to "["
    set isFirst to true
    set foundCount to 0

    tell application "Mail"
        try
            -- Search inbox specifically for simplicity
            set inboxMsgs to messages of inbox

            repeat with theMsg in inboxMsgs
                if foundCount >= maxResults then exit repeat

                set matchFound to false
                set msgSubject to subject of theMsg
                set msgSender to sender of theMsg

                -- Check match based on field
                if searchField is "subject" or searchField is "all" then
                    if msgSubject contains searchQuery then
                        set matchFound to true
                    end if
                end if

                if not matchFound and (searchField is "sender" or searchField is "all") then
                    if msgSender contains searchQuery then
                        set matchFound to true
                    end if
                end if

                if not matchFound and (searchField is "content" or searchField is "all") then
                    set msgContent to content of theMsg
                    if msgContent contains searchQuery then
                        set matchFound to true
                    end if
                end if

                if matchFound then
                    set foundCount to foundCount + 1
                    set msgId to id of theMsg
                    set msgDate to date received of theMsg
                    set msgRead to read status of theMsg
                    set msgFlagged to flagged status of theMsg

                    if not isFirst then
                        set jsonOutput to jsonOutput & ","
                    end if
                    set isFirst to false

                    set jsonOutput to jsonOutput & "{" & ¬
                        "\"id\":" & msgId & "," & ¬
                        "\"subject\":\"" & my escapeJSON(msgSubject) & "\"," & ¬
                        "\"sender\":\"" & my escapeJSON(msgSender) & "\"," & ¬
                        "\"date\":\"" & my formatDate(msgDate) & "\"," & ¬
                        "\"read\":" & msgRead & "," & ¬
                        "\"flagged\":" & msgFlagged & ¬
                        "}"
                end if
            end repeat

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
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
