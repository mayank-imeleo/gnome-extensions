
const { Clutter, Gio, GLib, GObject, GnomeDesktop, St } = imports.gi;

const Main = imports.ui.main;

const GWeather = imports.gi.GWeather;
const PanelMenu = imports.ui.panelMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const PopupMenu = imports.ui.popupMenu;

const Gtk = imports.gi.Gtk;

const Gettext_gd30 = imports.gettext.domain('gnome-desktop-3.0');
const _gd30 = Gettext_gd30.gettext;

let clock, buttons = [], gnomeClockSettings, mySettings, clocksSettings, locations, lang_is_rtl, enableSuccess = false;

var WorldClockMultiButton = GObject.registerClass(
class WorldClockMultiButton extends PanelMenu.Button {

  _init(lbt) {
    super._init(0.25);

    this._myClockDisp = new St.Label({
      y_align: Clutter.ActorAlign.CENTER,
      opacity: 150
    });
    this.add_actor(this._myClockDisp);

    this._place = new St.Label({ style_class: 'location-label' });
    this._sunrise = new St.Label();
    this._sunset = new St.Label();

    let m = this.menu;
    this._place._delegate = this;
    m.box.add(this._place);

    let box = new St.BoxLayout({ style_class: 'location-day' });
    this._dayIcon = new St.Icon({
      icon_size: 15,
      icon_name: 'weather-clear-symbolic',
      opacity: 150,
      style_class: 'location-sunrise-icon'
    });
    box.add_actor(this._dayIcon);
    box.add_actor(this._sunrise);
    
    this._nightIcon = new St.Icon({
      icon_size: 15,
      icon_name: 'weather-clear-night-symbolic',
      style_class: 'location-sunset-icon'
    });
    box.add_actor(this._nightIcon);
    box.add_actor(this._sunset);
    box._delegate = this;
    m.box.add(box);

    this._selectLoc = new PopupMenu.PopupSubMenuMenuItem(_("Locations"));
    m.addMenuItem(this._selectLoc);

    this.setLbt(lbt);
  }

  setLbt(lbt) {
    this._lbt = lbt;
    this._gwInfo = GWeather.Info.new(lbt._loc);
    this._gwInfo.set_enabled_providers(GWeather.Provider.NONE);

    let nameMap = mySettings.get_value('name-map').deep_unpack();
    if (nameMap[lbt.code]) {
      this._place.set_text(nameMap[lbt.code]);
    }
    else {
      this._place.set_text(lbt.displayName);
    }
    this.make_loc_menu();
    this.refresh();
  }

  _fromUnix(time) {
    return GLib.DateTime.new_from_unix_utc(time).to_timezone(this._lbt._tz);
  }

  refresh() {
    this._myClockDisp.set_text(this._lbt.getTime());
    let i = this._gwInfo;
    i.update();

    let night_icon_key = 'weather-clear-night';
    let moonPhase_icon_name = castInt(i.get_value_moonphase()[1]/10) + "0";
    while (moonPhase_icon_name.length < 3) { moonPhase_icon_name = "0" + moonPhase_icon_name; }
    moonPhase_icon_name = night_icon_key + "-" + moonPhase_icon_name;

    // 3.38
    let theme = new Gtk.IconTheme();
    theme.set_custom_theme(St.Settings.get().gtk_icon_theme);
    if (!theme.has_icon(moonPhase_icon_name)) {
      moonPhase_icon_name = night_icon_key + '-symbolic';
    }

    let valid_map = i.get_location().get_level() <= GWeather.LocationLevel.WEATHER_STATION;
    if (valid_map) {
      let sunrise = i.get_value_sunrise();
      let sunriseTime = this._fromUnix(sunrise[1]);
      let sunset = i.get_value_sunset();
      let sunsetTime = this._fromUnix(sunset[1]);

      this._dayIcon.set_icon_name(!sunrise[0] && !i.is_daytime() ? moonPhase_icon_name : 'weather-clear-symbolic');
      this._nightIcon.set_icon_name(!sunset[0] && i.is_daytime() ? 'weather-clear-symbolic' : moonPhase_icon_name);

      this._dayIcon.set_opacity(!sunrise[0] && !i.is_daytime() ? 255 : 150);
      this._dayIcon.show();
      this._nightIcon.set_opacity(!sunset[0] && i.is_daytime() ? 150 : 255);
      this._nightIcon.show();

      this._sunrise.set_text(sunrise[0] ? sunriseTime.format(_(get12hTimeFormat(sunriseTime))) : "\u2014\u2014");
      this._sunrise.show();
      this._sunset.set_text(sunset[0] ? sunsetTime.format(_(get12hTimeFormat(sunsetTime))) : "");
      this._sunset.show();
    } else {
      this._sunrise.hide();
      this._dayIcon.hide();
      this._sunset.hide();
      this._nightIcon.hide();
    }
  }

  make_loc_menu() {
    let lm = this._selectLoc.menu;
    lm.removeAll();
    let that = this;
    let skipLocal = mySettings.get_boolean('hide-local');
    let entries = 0;
    locations.map(function (loc) {
      let lbt = new LocationBasedTime(loc);
      if (skipLocal && lbt.tzSameAsLocal()) { return; }
      let display = lbt.displayName3;

      // rtl time fix
      if (lang_is_rtl)
	display = "\u202a" + display + "\u202c";

      let item = new PopupMenu.PopupMenuItem(display);
      item.location = lbt;
      item.setOrnament(lbt.code == that._lbt.code ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
      lm.addMenuItem(item);
      entries += 1;
      item.connect('activate', function (actor) {
	that.switchLbt(actor.location);
	saveButtonConfig();
      });
    });

    if (entries <= 1)
      this._selectLoc.hide();
    else
      this._selectLoc.show();
  }

  switchLbt(lbt) {
    let lastLoc = this._lbt;
    if (lastLoc.code == lbt.code) { return; }
    buttons.map(function (x) {
      if (x._lbt.code == lbt.code) {
	x.setLbt(lastLoc);
      }
    });
    this.setLbt(lbt);    
  }
});

var LocationBasedTime = (
class LocationBasedTime {
  constructor(...args) {
    this._init(...args);
  }

  _init(loc) {
    this._loc = loc;
    this._tz = loc.get_timezone();
    if (!(this._tz instanceof GLib.TimeZone)) {
      // GWeather 3
      this._tz = GLib.TimeZone.new(this._tz.get_tzid());
    }

    let world = GWeather.Location.get_world();
    let city = loc.has_coords() ? world.find_nearest_city(...loc.get_coords()) : loc;

    this.displayName = loc.get_city_name() || city.get_name();
    this.displayName2 = loc.get_name();

    let country_name = loc.get_country_name();
    if (country_name) {
      this.displayName = (this.displayName ? this.displayName + ", " : "") + country_name;
    }
    let country_code = loc.get_country();
    if (country_code) {
      this.displayName2 = (this.displayName2 ? this.displayName2 +
			   " (" + country_code + ")" : country_code);
    }
    if (!this.displayName) {
      this.displayName = loc.get_name();
    }

    let ncode = [loc];
    let code = [];
    while (!code.length && ncode.length) {
      ncode = ncode.map(function (x) {
	let c = x.get_code();
	if (c) {
	  code.push(c);
	  return [];
	}
	if (x.get_children) {
	  // GWeather 3
	  return x.get_children();
	} else {
	  // GWeather 4
	  let r = [];
	  let iter = null;
	  while ((iter = x.next_child(iter)) !== null) {
	    r.push(iter)
	  }
	  return r;
	}
      }).reduce(function (a, b) {
	return a.concat(b);
      });
    }
    this.code = code.join(",");

    let nameMap = mySettings.get_value('name-map').deep_unpack();
    if (nameMap[this.code]) {
      this.displayName3 = nameMap[this.code] + (country_code ? " (" + country_code + ")" : "");
    } else {
      this.displayName3 = this.displayName2;
    }
  }

  now() {
    return GLib.DateTime.new_now(this._tz);
  }

  tzSameAsLocal() {
    let now = this.now();
    return now.get_timezone_abbreviation() == now.to_local().get_timezone_abbreviation();
  }

  getTime() {
    let now = this.now();
    let now_here = now.to_local();
    let format_string = _gd30((now_here.get_day_of_month() != now.get_day_of_month() ?
			       "%a " : "") + get12hTimeFormat(now));
    if (mySettings.get_boolean('show-city')) {
      let sfx = this.displayName3.match(/ \((\w+)\)$/);
      return now.format(format_string) + " " + (this._loc.has_coords() || !sfx ? this.displayName3 : sfx[1]);
    } else {
      return now.format(format_string + " %Z");
    }
  }
});

function get12hTimeFormat(when) {
  return gnomeClockSettings.get_string('clock-format') != '12h' ||
    !when.format("%p").length ? "%R" : "%l:%M %p";
}

function castInt(num) {
    return ~~num;
}

function saveButtonConfig() {
  let config = buttons.map(x => x._lbt.code);
  mySettings.set_value('active-buttons', new GLib.Variant('as', config));
}

function init() {
  
}

let remaking;

function remakeButtons() {
  if (remaking) { return; }
  remaking = true;
  
  buttons.map(x => x.destroy());
  buttons = locations.map(function (loc) {
    let lbt = new LocationBasedTime(loc);
    let btn = new WorldClockMultiButton(lbt);
    btn.refresh();
    return btn;
  });

  let i = 0;
  mySettings.get_value('active-buttons').deep_unpack().map(function (c) {
    let ob = buttons.filter(b => b._lbt.code == c);
    if (ob[0] && buttons[i]) {
      buttons[i].switchLbt(ob[0]._lbt);
      i += 1;
    }
  });
  saveButtonConfig();

  let g = 1;
  ['', '2'].map(function(dual) {
    if (dual == '2' && mySettings.get_string('button-position') == mySettings.get_string('button-position2')) {
      return;
    }
    let j = 1;
    let position = mySettings.get_string('button-position' + dual);
    let box_ref = ({
      'L': Main.panel._leftBox,
      'M': Main.panel._centerBox,
      'R': Main.panel._rightBox
    })[position[0]];
    let box_name = ({
      'L': 'left',
      'M': 'center',
      'R': 'right'
    })[position[0]];
    let start_position = ({
      'L': 0,
      '1': 1,
      '9': box_ref.get_n_children() - 1,
      'R': box_ref.get_n_children()
    })[position[1]];
    let numButtons = mySettings.get_value('num-buttons' + dual).deep_unpack();
    let skipLocal = mySettings.get_boolean('hide-local');
    let done = 0;
    buttons.map(function (x) {
      if (skipLocal && x._lbt.tzSameAsLocal()) { return; }
      done += 1;
      if (done < g) { return; }
      if (j <= numButtons) {
	Main.panel.addToStatusArea('worldClock'+g, x, start_position + j - 1, box_name);
	j += 1;
	g += 1;
      }
    });
  });

  remaking = false;
}

function refreshLocations() {
  let world = GWeather.Location.get_world();
  
  let world_clocks = clocksSettings.get_value('world-clocks');
  locations = world_clocks.deep_unpack()
    .map(e => world.deserialize(e.location))
    .filter(e => e.get_timezone());

  remakeButtons();
}

function enable() {
  clocksSettings = Convenience.getClocksSettings();
  enableSuccess = true;

  clock = new GnomeDesktop.WallClock();

  mySettings = ExtensionUtils.getSettings();
  gnomeClockSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });

  // rtl time fix
  lang_is_rtl = (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL);

  refreshLocations();

  let refreshAll = function () {
    buttons.map(x => x.refresh());
  };

  clock.connect('notify::clock', refreshAll);
  gnomeClockSettings.connect('changed::clock-format', refreshAll);
  clocksSettings.connect('changed::world-clocks', refreshLocations);
  mySettings.connect('changed', remakeButtons);
  clock.connect('notify::timezone', remakeButtons);
}


function disable() {
  if (!enableSuccess)
    return;

  locations = [];
  buttons.map(x => x.destroy());
  buttons = [];
  clock.run_dispose();
  clock = null;
  gnomeClockSettings.run_dispose();
  gnomeClockSettings = null;
  clocksSettings.run_dispose();
  clocksSettings = null;
  mySettings.run_dispose();
  mySettings = null;
  enableSuccess = false;
}
