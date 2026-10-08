[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1, 4294967295)][uint32]$DesktopProcessId,
    [ValidateSet('Read', 'ChooseNo')][string]$Action = 'Read'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$desktopProcess = Get-Process -Id $DesktopProcessId -ErrorAction Stop
if ($desktopProcess.ProcessName -ne 'hbar-desktop') { throw 'The supplied process is not the owned Desktop binary' }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public sealed class OwnedCloseDialogSnapshot {
    public string Title { get; set; }
    public string Message { get; set; }
    public uint ProcessId { get; set; }
    public bool HasNoButton { get; set; }
}
public static class OwnedCloseDialog {
    private delegate bool EnumWindowProc(IntPtr hwnd, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassNameW(IntPtr hwnd, StringBuilder value, int capacity);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr hwnd, StringBuilder value, int capacity);
    [DllImport("user32.dll")] private static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
    [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr SendMessageTimeoutW(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    private static string Text(IntPtr hwnd) { var text = new StringBuilder(8192); GetWindowTextW(hwnd, text, text.Capacity); return text.ToString(); }
    private static string Class(IntPtr hwnd) { var text = new StringBuilder(128); GetClassNameW(hwnd, text, text.Capacity); return text.ToString(); }
    public static OwnedCloseDialogSnapshot Inspect(uint target, bool chooseNo) {
        IntPtr owned = IntPtr.Zero;
        EnumWindows((hwnd, parameter) => {
            uint processId; GetWindowThreadProcessId(hwnd, out processId);
            if (processId == target && Class(hwnd) == "#32770") { owned = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        if (owned == IntPtr.Zero) return null;
        uint confirmed; GetWindowThreadProcessId(owned, out confirmed);
        if (confirmed != target) throw new InvalidOperationException("Close dialog ownership changed");
        var parts = new List<string>();
        EnumChildWindows(owned, (hwnd, parameter) => {
            if (Class(hwnd).Equals("Static", StringComparison.OrdinalIgnoreCase)) {
                var text = Text(hwnd); if (!String.IsNullOrWhiteSpace(text)) parts.Add(text);
            }
            return true;
        }, IntPtr.Zero);
        var no = GetDlgItem(owned, 7);
        var snapshot = new OwnedCloseDialogSnapshot { Title = Text(owned), Message = String.Join("\n", parts), ProcessId = confirmed, HasNoButton = no != IntPtr.Zero };
        if (chooseNo) {
            if (no == IntPtr.Zero) throw new InvalidOperationException("Owned No button is missing");
            IntPtr result;
            if (SendMessageTimeoutW(no, 0x00f5, IntPtr.Zero, IntPtr.Zero, 2, 5000, out result) == IntPtr.Zero)
                throw new InvalidOperationException("Owned No action timed out");
        }
        return snapshot;
    }
}
'@
$snapshot = [OwnedCloseDialog]::Inspect($DesktopProcessId, $Action -eq 'ChooseNo')
$json = ConvertTo-Json -InputObject $snapshot -Compress
[Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($json))
