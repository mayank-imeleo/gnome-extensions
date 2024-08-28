
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

let settings, clocksSettings, openWinsCounter;

function init() {
}

let position_inhibitor = false;

function buildPrefsWidget() {
  let ui = Gtk.Builder.new_from_file(Me.dir.get_path() + "/prefs.ui");
  let win = ui.get_object('content-table');

  if (!settings) {
    settings = ExtensionUtils.getSettings();
    clocksSettings = Convenience.getClocksSettings();    
    openWinsCounter = 0;
  }
  else {
    openWinsCounter = openWinsCounter + 1;
  }

  settings.bind('hide-local', ui.get_object('local-cb'), 'active', Gio.SettingsBindFlags.DEFAULT);
  settings.bind('num-buttons', ui.get_object('num-adj'), 'value', Gio.SettingsBindFlags.DEFAULT);
  settings.bind('num-buttons2', ui.get_object('num-adj2'), 'value', Gio.SettingsBindFlags.DEFAULT);
  settings.bind('show-city', ui.get_object('show-city-cb'), 'active', Gio.SettingsBindFlags.DEFAULT);


  let positions_button_syms = ['LR', 'ML', 'M1', 'MR', 'RL'];
  let positionFromSetting = function() {
    if (position_inhibitor) { return; }
    position_inhibitor = true;
    positions_button_syms.map(function (pos_symbol) {
      ui.get_object('position-' + pos_symbol)
	.set_active(pos_symbol == settings.get_string('button-position') ||
		    pos_symbol == settings.get_string('button-position2'));
    });
    if ((settings.get_string('button-position') == settings.get_string('button-position2'))) {
      ui.get_object('num-sp2').hide();
    } else {
      ui.get_object('num-sp2').show();
    }
    position_inhibitor = false;
  };
  let middleOf = function (a, b, c) {
    return (((a + (b-a)/2)-((c-1)/2))*1.1+((c-1)/2));
  };
  positions_button_syms.map(function (pos_symbol) {
    let cl = pos_symbol;
    ui.get_object('position-' + cl).connect('toggled', function(object) {
      let cl2 = cl;
      if (position_inhibitor) { return; }
      position_inhibitor = true;
      if (cl2 == settings.get_string('button-position2')) {
	settings.set_string('button-position2', settings.get_string('button-position'));
      } else if (cl2 == settings.get_string('button-position')) {
	settings.set_string('button-position', settings.get_string('button-position2'));
      } else if (middleOf(positions_button_syms.indexOf(settings.get_string('button-position')), positions_button_syms.indexOf(settings.get_string('button-position2')), positions_button_syms.length) < positions_button_syms.indexOf(cl)) {
	settings.set_string('button-position2', cl);
      } else {
	settings.set_string('button-position', cl);
      }
      position_inhibitor = false;
      positionFromSetting();
    });
  });
  positionFromSetting();
  settings.connect('changed::button-position', positionFromSetting);
  settings.connect('changed::button-position2', positionFromSetting);
  ui.get_object('open-gnome-clocks').connect('clicked', function() {
    let di = Gio.DesktopAppInfo.new('org.gnome.clocks.desktop');
    let ctx = Gdk.Display.get_default().get_app_launch_context();
    di.launch([], ctx);
  });
  
  win.connect('destroy', function () {
    if (!openWinsCounter) {
      settings.run_dispose();
      settings = null;
      clocksSettings.run_dispose();
      clocksSettings = null;
    }
    else {
      openWinsCounter = openWinsCounter - 1;
    }
  });
  
  return win;
}
