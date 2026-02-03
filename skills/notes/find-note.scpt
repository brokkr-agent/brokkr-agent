#!/usr/bin/osascript
-- find-note.scpt
-- Find a note by title (partial match) or ID (exact match) from Notes.app
--
-- Usage: osascript find-note.scpt "search-term"
-- Search term can be a partial title or exact note ID (x-coredata://...)
--
-- Output format:
-- {"success": true, "data": [{id, name, folder, creationDate, modificationDate}...], "error": null}

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
    try
        if (count of argv) < 1 then
            return "{\"success\": false, \"data\": [], \"error\": \"Usage: osascript find-note.scpt \\\"search-term\\\"\"}"
        end if

        set searchTerm to item 1 of argv
        set noteData to {}

        tell application "Notes"
            set defaultAccount to default account
            set allFolders to folders of defaultAccount

            repeat with fld in allFolders
                set folderName to name of fld
                set folderNotes to notes of fld

                repeat with nte in folderNotes
                    set noteID to id of nte
                    set noteName to name of nte

                    -- Check if ID matches exactly or name contains search term (case-insensitive)
                    set isMatch to false

                    -- Exact ID match
                    if noteID is searchTerm then
                        set isMatch to true
                    else
                        -- Partial title match (case-insensitive)
                        ignoring case
                            if noteName contains searchTerm then
                                set isMatch to true
                            end if
                        end ignoring
                    end if

                    if isMatch then
                        set creationDateStr to my formatDate(creation date of nte)
                        set modificationDateStr to my formatDate(modification date of nte)

                        -- Build JSON object for this note
                        set noteJSON to "{\"id\": \"" & my escapeJSONString(noteID) & "\", \"name\": \"" & my escapeJSONString(noteName) & "\", \"folder\": \"" & my escapeJSONString(folderName) & "\", \"creationDate\": \"" & creationDateStr & "\", \"modificationDate\": \"" & modificationDateStr & "\"}"

                        set end of noteData to noteJSON
                    end if
                end repeat
            end repeat
        end tell

        -- Join note objects with commas
        set AppleScript's text item delimiters to ", "
        set notesJSON to noteData as text
        set AppleScript's text item delimiters to ""

        -- Build final response
        set resultJSON to "{\"success\": true, \"data\": [" & notesJSON & "], \"error\": null}"

        return resultJSON

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run
