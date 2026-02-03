-- list-folders.scpt
-- Lists all mailboxes/folders from all accounts
-- Output: JSON array of mailbox objects with account, name, unread, total

on run argv
    set jsonOutput to "["
    set isFirst to true

    tell application "Mail"
        repeat with acct in accounts
            set acctName to name of acct

            repeat with mbox in mailboxes of acct
                set mboxName to name of mbox
                set unreadCount to unread count of mbox
                set msgCount to count of messages of mbox

                if not isFirst then
                    set jsonOutput to jsonOutput & ","
                end if
                set isFirst to false

                set jsonOutput to jsonOutput & "{" & ¬
                    "\"account\":\"" & my escapeJSON(acctName) & "\"," & ¬
                    "\"name\":\"" & my escapeJSON(mboxName) & "\"," & ¬
                    "\"unread\":" & unreadCount & "," & ¬
                    "\"total\":" & msgCount & ¬
                    "}"
            end repeat
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
