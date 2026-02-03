#!/usr/bin/osascript
-- list-recent.scpt
-- Lists recently modified notes across all folders from Notes.app and returns JSON output
--
-- Usage: osascript list-recent.scpt [limit]
-- If no limit is specified, defaults to 10
--
-- Output format:
-- {"success": true, "data": [{name, id, creationDate, modificationDate, folder}...], "error": null}

on escapeJSONString(theString)
    -- Escape special characters for JSON string
    set escapedString to theString
    set escapedString to my replaceText(escapedString, "\\", "\\\\")
    set escapedString to my replaceText(escapedString, "\"", "\\\"")
    set escapedString to my replaceText(escapedString, return, "\\n")
    set escapedString to my replaceText(escapedString, linefeed, "\\n")
    set escapedString to my replaceText(escapedString, tab, "\\t")
    return escapedString
end escapeJSONString

on replaceText(theText, searchStr, replaceStr)
    set AppleScript's text item delimiters to searchStr
    set textItems to text items of theText
    set AppleScript's text item delimiters to replaceStr
    set resultText to textItems as text
    set AppleScript's text item delimiters to ""
    return resultText
end replaceText

on formatDate(theDate)
    -- Format date as ISO 8601 string
    if theDate is missing value then
        return ""
    end if
    try
        set y to year of theDate as string
        set m to month of theDate as integer
        if m < 10 then set m to "0" & m
        set d to day of theDate as integer
        if d < 10 then set d to "0" & d
        set h to hours of theDate as integer
        if h < 10 then set h to "0" & h
        set min to minutes of theDate as integer
        if min < 10 then set min to "0" & min
        set s to seconds of theDate as integer
        if s < 10 then set s to "0" & s
        return y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
    on error
        return ""
    end try
end formatDate

on run argv
    -- Get limit from argument or default to 10
    set noteLimit to 10
    if (count of argv) > 0 then
        try
            set noteLimit to (item 1 of argv) as integer
        on error
            set noteLimit to 10
        end try
    end if

    try
        tell application "Notes"
            set defaultAccount to default account
            set allFolders to folders of defaultAccount

            -- Collect all notes with their folder names
            set noteRecords to {}

            repeat with fld in allFolders
                set folderName to name of fld
                set folderNotes to notes of fld

                repeat with n in folderNotes
                    set noteName to name of n
                    set noteID to id of n
                    set creationDateVal to creation date of n
                    set modificationDateVal to modification date of n

                    -- Store as a record with date for sorting
                    set end of noteRecords to {noteName:noteName, noteID:noteID, creationDate:creationDateVal, modificationDate:modificationDateVal, folderName:folderName}
                end repeat
            end repeat

            -- Sort by modification date (descending) using bubble sort
            set noteCount to count of noteRecords
            repeat with i from 1 to noteCount - 1
                repeat with j from 1 to noteCount - i
                    set rec1 to item j of noteRecords
                    set rec2 to item (j + 1) of noteRecords
                    if modificationDate of rec1 < modificationDate of rec2 then
                        set item j of noteRecords to rec2
                        set item (j + 1) of noteRecords to rec1
                    end if
                end repeat
            end repeat

            -- Take only the first noteLimit items
            if noteCount > noteLimit then
                set noteRecords to items 1 thru noteLimit of noteRecords
            end if

            -- Build JSON array
            set noteData to {}
            repeat with rec in noteRecords
                set creationDateStr to my formatDate(creationDate of rec)
                set modificationDateStr to my formatDate(modificationDate of rec)

                -- Build JSON object for this note
                set noteJSON to "{\"name\": \"" & my escapeJSONString(noteName of rec) & "\", \"id\": \"" & my escapeJSONString(noteID of rec) & "\", \"creationDate\": \"" & creationDateStr & "\", \"modificationDate\": \"" & modificationDateStr & "\", \"folder\": \"" & my escapeJSONString(folderName of rec) & "\"}"

                set end of noteData to noteJSON
            end repeat

            -- Join note objects with commas
            set AppleScript's text item delimiters to ", "
            set notesJSON to noteData as text
            set AppleScript's text item delimiters to ""

            -- Build final response
            set resultJSON to "{\"success\": true, \"data\": [" & notesJSON & "], \"error\": null}"

            return resultJSON
        end tell

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run
