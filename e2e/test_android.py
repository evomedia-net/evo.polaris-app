# evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
# Created by Kelly Michels · dev@evomedia.net
# Licensed under the MIT License. See LICENSE.

"""The Android app, end to end, where native Android meets the polaris page.

pytest runs these in file order and they share one session, so the location
test comes first: it is the only one that needs Android to have never been
asked for the permission. Every later test sets up the position it needs.
"""

from __future__ import annotations

import re

import pytest
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.by import By

from conftest import PACKAGE, adb, by_id, choose_mode, place_by_hand, tap, text_of, wait, web

TITLE = "evo.polaris — accessible night-sky guide and polar alignment"
ALLOW_WHILE_IN_USE = "com.android.permissioncontroller:id/permission_allow_foreground_only_button"


def test_opens_on_the_page_bundled_inside_the_app(driver):
    assert driver.current_package == PACKAGE
    with web(driver):
        assert driver.title == TITLE
        # Capacitor serves the bundled files from https://localhost. Anything
        # else means the app loaded a page from the network, and polaris has to
        # work in a field with no signal.
        assert driver.execute_script("return location.origin") == "https://localhost"


def test_location_comes_through_androids_own_permission_dialog(driver):
    driver.set_location(29.7604, -95.3698, 15)  # the emulator's GPS
    with web(driver):
        tap(driver, "locateBtn")
    # The prompt is Android's, not the page's: no browser test can press it.
    wait(driver, 30).until(lambda d: d.find_elements(AppiumBy.ID, ALLOW_WHILE_IN_USE))
    driver.find_element(AppiumBy.ID, ALLOW_WHILE_IN_USE).click()
    driver.set_location(29.7604, -95.3698, 15)  # a fresh fix once the app may read it
    with web(driver):
        wait(driver, 45).until(lambda d: text_of(d, "outLat").startswith("29.76"))
        assert text_of(driver, "locateStatus").startswith("Located to about")
        assert text_of(driver, "placeWhere").startswith("29.76° N, 95.37° W")


# Strict, and only for an assertion: when polaris fixes it this turns red as a
# reminder to drop the marker, and a broken session is still an error.
@pytest.mark.xfail(strict=True, raises=AssertionError,
                   reason="evo.polaris#300: the readout shows '-95.3698° W', a minus and a hemisphere")
def test_the_position_readout_shows_the_hemisphere_without_a_minus_sign(driver):
    with web(driver):
        place_by_hand(driver)
        assert text_of(driver, "outLon") == "95.3698° W"


def test_read_aloud_goes_to_the_phones_speech_engine(driver):
    # Android's WebView has no speechSynthesis. Without the app's shim the
    # button would say "This browser has no speech engine" and switch itself
    # off, so the promise to read the numbers out loud would be broken.
    with web(driver):
        place_by_hand(driver)
        choose_mode(driver, "align")
        if by_id(driver, "settingsCard").get_attribute("open") is None:
            summary = by_id(driver, "settingsCard").find_element(By.CSS_SELECTOR, "summary")
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", summary)
            summary.click()
        tap(driver, "speakBtn")
        assert text_of(driver, "speakNote") == ""
        assert by_id(driver, "speakBtn").is_enabled()
        assert driver.execute_script("return typeof window.speechSynthesis.speak") == "function"


def _bars_visible(drv) -> bool:
    """Whether the status and navigation bars show, as Android's window manager says.

    Not Appium's getSystemBars: on Android 16 it reports both bars visible
    while they are plainly hidden. The window manager's inset sources do not.
    """
    out = adb(drv, "shell", "dumpsys", "window")
    states = re.findall(r"InsetsSource[^\n]*?type=(?:statusBars|navigationBars)[^\n]*?visible=(true|false)", out)
    assert states, "dumpsys window reported no system bar inset sources"
    return "true" in states


def _tap_native(drv, label: str) -> None:
    """A real touch on the screen, found by the name Android's accessibility tree gives it."""
    drv.find_element(AppiumBy.XPATH, f'//*[@text="{label}" or @content-desc="{label}"]').click()


def test_full_screen_hides_the_phones_status_and_navigation_bars(driver):
    with web(driver):
        place_by_hand(driver)
        choose_mode(driver, "sky")
        driver.execute_script("document.getElementById('fullBtn').scrollIntoView({block: 'center'})")
    assert _bars_visible(driver)
    # A finger on the button, not a script click: the page may only ask for
    # full screen inside a real user gesture.
    _tap_native(driver, "Use full screen")
    with web(driver):
        wait(driver).until(lambda d: d.execute_script("return !!document.fullscreenElement"))
    wait(driver).until(lambda d: not _bars_visible(d))
    # The first time, Android explains how to get out; a person presses Got it.
    for notice in driver.find_elements(AppiumBy.XPATH, '//*[@text="Got it"]'):
        notice.click()
    _tap_native(driver, "Exit full screen")
    with web(driver):
        wait(driver).until(lambda d: d.execute_script("return !document.fullscreenElement"))
    wait(driver).until(_bars_visible)


def _sky_full(drv) -> str | None:
    return drv.execute_script("return document.documentElement.dataset.skyfull || null")


def test_turning_the_phone_sideways_fills_the_screen_with_the_sky(driver):
    with web(driver):
        place_by_hand(driver)
        choose_mode(driver, "sky")
        if _sky_full(driver) == "on":  # left on by an earlier test
            tap(driver, "fullBtn")
        wait(driver).until(lambda d: _sky_full(d) in (None, "off"))
    driver.orientation = "LANDSCAPE"
    try:
        with web(driver):
            wait(driver).until(lambda d: _sky_full(d) == "on")
    finally:
        driver.orientation = "PORTRAIT"
    with web(driver):
        wait(driver).until(lambda d: _sky_full(d) == "off")


# --- accessibility, in the tree Android hands to TalkBack ----------------------
#
# polaris is checked against WCAG 2.2 AA in a browser by its own suite. These
# check what only the phone can show: the accessibility tree Android builds
# from the WebView, which is what TalkBack and Switch Access actually use, and
# the page at Android's largest system font size.

CONTROL_CLASSES = {"android.widget.Button", "android.widget.EditText", "android.widget.CheckBox",
                   "android.widget.RadioButton", "android.widget.Spinner", "android.widget.ToggleButton"}


def _bounds(node) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = map(int, re.findall(r"-?\d+", node.get("bounds")))
    return x1, y1, x2, y2


def _name(node) -> str:
    if node.get("class") == "android.widget.EditText":
        # A text field's value is not its name. The WebView leaves the hint
        # empty and writes the field's text as "<value or placeholder>, <label>",
        # so a field is named only if something follows that first comma.
        _, _, label = node.get("text", "").partition(", ")
        return " ".join(filter(None, (node.get("hint", "").strip(), node.get("content-desc", "").strip(), label.strip())))
    return " ".join(filter(None, (node.get(a, "").strip() for a in ("text", "content-desc", "hint"))))


def _sweep(drv) -> dict:
    """Every control in the WebView's accessibility tree, scrolling the page top to bottom.

    Keyed by (class, id, name); the value is the largest size each was seen at,
    in density-independent pixels, so a control half under an edge on one
    screen is measured where it was whole.
    """
    import xml.etree.ElementTree as ET

    dp = 160 / drv.get_display_density()
    found: dict = {}
    with web(drv):
        drv.execute_script("window.scrollTo(0, 0)")
    for _ in range(60):
        root = ET.fromstring(drv.page_source.encode("utf-8"))
        webview = next(root.iter("android.webkit.WebView"))
        for node in webview.iter():
            if node is webview or not node.get("bounds"):
                continue
            if node.get("clickable") != "true" and node.get("class") not in CONTROL_CLASSES:
                continue
            x1, y1, x2, y2 = _bounds(node)
            key = (node.get("class"), node.get("resource-id") or "", _name(node))
            w, h = round((x2 - x1) * dp), round((y2 - y1) * dp)
            best = found.get(key, (0, 0))
            found[key] = (max(best[0], w), max(best[1], h))
        with web(drv):
            before = drv.execute_script("return scrollY")
            drv.execute_script("window.scrollBy(0, innerHeight * 0.6)")
            if drv.execute_script("return scrollY") == before:
                break
    return found


def _every_state(drv) -> dict:
    """Sweep each screen a person moves through, with every card opened."""
    found: dict = {}
    open_all = "document.querySelectorAll('details').forEach(d => { d.open = true; })"
    with web(drv):
        place_by_hand(drv)
        tap(drv, "placeChange")              # the place card, with the form open
        if not by_id(drv, "manualEntry").is_displayed():
            tap(drv, "manualToggle")
    found.update(_sweep(drv))
    with web(drv):
        tap(drv, "manualApply")              # the same place again, which folds the card away
        wait(drv).until(lambda d: not by_id(d, "placeCard").is_displayed())
    for mode in ("sky", "align"):
        with web(drv):
            choose_mode(drv, mode)
            drv.execute_script(open_all)
        found.update(_sweep(drv))
    with web(drv):                          # the sky picture's own controls, full screen
        choose_mode(drv, "sky")
        tap(drv, "fullBtn")
        wait(drv).until(lambda d: d.execute_script("return document.documentElement.dataset.skyfull") == "on")
    try:
        found.update(_sweep(drv))
    finally:
        for notice in drv.find_elements(AppiumBy.XPATH, '//*[@text="Got it"]'):
            notice.click()
        with web(drv):
            tap(drv, "fullBtn")
    return found


@pytest.fixture(scope="module")
def controls(driver):
    return _every_state(driver)


def test_every_control_has_a_name_talkback_can_read(controls):
    # WCAG 4.1.2 Name, Role, Value: a control with no name is read as "button",
    # and nobody can tell which one it is.
    assert len(controls) > 30, f"the sweep found only {len(controls)} controls"
    unnamed = sorted(f"{cls} {rid}" for cls, rid, name in controls if not name)
    assert not unnamed, f"controls with no accessible name: {unnamed}"


def test_every_app_control_is_at_least_24_by_24(controls):
    # WCAG 2.5.8 Target Size (Minimum): 24 by 24 CSS pixels, which on Android
    # is 24 dp. Links inside a line of text are exempt by the criterion's own
    # inline exception, so the rule is held for every Android button and every
    # control the app gives an id: everything someone aims a finger, a stylus
    # or a mouthstick at on purpose.
    small = sorted(f"{rid or cls} '{name[:40]}' {w}x{h} dp"
                   for (cls, rid, name), (w, h) in controls.items()
                   if (cls == "android.widget.Button" or rid) and (w < 24 or h < 24))
    assert not small, f"targets under 24 x 24 dp: {small}"


def test_the_largest_system_font_never_makes_the_page_scroll_sideways(driver):
    # WCAG 1.4.4 Resize Text and 1.4.10 Reflow. A layout that is wider than the
    # phone at a large font size does not look broken to the person using it:
    # it looks like the page will not scroll.
    size = "return parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)"
    sideways = "return document.documentElement.scrollWidth - document.documentElement.clientWidth"
    with web(driver):
        place_by_hand(driver)
        normal = driver.execute_script(size)
    adb(driver, "shell", "settings", "put", "system", "font_scale", "2.0")
    try:
        driver.terminate_app(PACKAGE)
        driver.activate_app(PACKAGE)
        with web(driver):
            wait(driver).until(lambda d: d.execute_script(size) > normal * 1.5)
            for mode in ("sky", "align"):
                choose_mode(driver, mode)
                driver.execute_script("document.querySelectorAll('details').forEach(d => { d.open = true; })")
                assert driver.execute_script(sideways) <= 1, f"{mode}: the page is wider than the screen"
    finally:
        adb(driver, "shell", "settings", "put", "system", "font_scale", "1.0")
        driver.terminate_app(PACKAGE)
        driver.activate_app(PACKAGE)
