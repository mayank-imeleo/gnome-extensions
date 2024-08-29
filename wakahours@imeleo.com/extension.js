const { St } = imports.gi;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

// NOTE: /var/log/syslog shows output from gnome extensions

// todo: Wakatime extension is not complete yet.

const REFRESH_INTERVAL_SECONDS = 10;

const LOG_PREFIX = "[WakaTime Gnome Extension]";

let panelButton = new St.Bin({
  style: "padding-top: 7px;padding-right: 3px;padding-left: 3px;",
});

let panelButtonText = new St.Label({
  text: getPanelButtonText(),
});

function disable() {
  Main.panel._rightBox.remove_child(panelButton);
}

function _enable() {
  Main.panel._rightBox.insert_child_at_index(panelButton, 0);
  console.log("WakaTime extension enabled");
  updatePanelButtonText();
  writeWakatimeOutput().then();
  GLib.timeout_add_seconds(
    GLib.PRIORITY_DEFAULT,
    REFRESH_INTERVAL_SECONDS,
    () => {
      writeWakatimeOutput().then();
      updatePanelButtonText();
      return true; // Continue the timeout
    },
  );
}

function readWakatimeOutput() {
  const CMD = "cat /tmp/wakatime.txt";
  let [ok, commandOutputBytes] = GLib.spawn_command_line_sync(CMD);
  if (!ok) {
    return "Error";
  }
  return commandOutputBytes.toString();
}

async function writeWakatimeOutput() {
  const CMD = "wakatime --today";
  console.log(`${LOG_PREFIX} Running command: ${CMD}`);
  GLib.spawn_command_line_async(CMD);
  let [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
    null,
    ["/bin/sh", "-c", CMD],
    null,
    GLib.SpawnFlags.DO_NOT_REAP_CHILD,
    null,
  );

  if (!success) {
    reject("Error spawning command");
    return;
  }
  let outputStream = new Gio.DataInputStream({
    base_stream: new Gio.UnixInputStream({ fd: stdout, close_fd: true }),
  });
}

function getPanelButtonText() {
  /*
   * Convert waka time output to a string to be displayed on the panel.
   * */
  const wakaTimeOutput = readWakatimeOutput();
  // sample output: ['4 hrs 2 mins','51 mins']
  let hours = wakaTimeOutput.match(/(\d+) hr/);
  hours = hours ? hours[1] : "0";
  let minutes = wakaTimeOutput.match(/(\d+) min/);
  minutes = minutes ? minutes[1] : "0";
  minutes = parseInt(minutes) < "10" ? `0${minutes}` : minutes;
  return `⏳W ${hours}:${minutes}`;
}

function init() {
  panelButton.set_child(panelButtonText);
}

function updatePanelButtonText() {
  panelButtonText.set_text(getPanelButtonText(readWakatimeOutput()));
}
