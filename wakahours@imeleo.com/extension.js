const { St } = imports.gi;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

const REFRESH_INTERVAL_SECONDS = 60 * 5;

let panelButton = new St.Bin({
  style: "padding-top: 7px;padding-right: 3px;padding-left: 3px;",
});

let panelButtonText = new St.Label({
  text: getPanelButtonText(getWakatimeValue()),
});

function disable() {
  Main.panel._rightBox.remove_child(panelButton);
}

function enable() {
  Main.panel._rightBox.insert_child_at_index(panelButton, 0);
  updatePanelButtonText();
  GLib.timeout_add_seconds(
    GLib.PRIORITY_DEFAULT,
    REFRESH_INTERVAL_SECONDS,
    () => {
      updatePanelButtonText();
      return true; // Continue the timeout
    },
  );
}

function getWakatimeValue() {
  var [ok, commandOutputBytes] =
    GLib.spawn_command_line_sync("wakatime --today");
  if (!ok) {
    return "Error";
  }
  let commandOutput = commandOutputBytes.toString();
  // sample output: ['4 hrs 2 mins','51 mins']
  let hours = commandOutput.match(/(\d+) hr/);
  hours = hours ? hours[1] : "0";
  let minutes = commandOutput.match(/(\d+) min/);
  minutes = minutes ? minutes[1] : "0";
  minutes = parseInt(minutes) < "10" ? `0${minutes}` : minutes;
  return `${hours}:${minutes}`;
}

function getPanelButtonText(wakaTimeValue) {
  return `⏳W ${wakaTimeValue}`;
}

function init() {
  panelButton.set_child(panelButtonText);
}

function updatePanelButtonText() {
  panelButtonText.set_text(getPanelButtonText(getWakatimeValue()));
}
