# evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
# Created by Kelly Michels · dev@evomedia.net
# Licensed under the MIT License. See LICENSE.

"""One Appium session for the whole run, and the few helpers every test needs.

The tests drive the real debug APK on an Android emulator through Appium's
UiAutomator2 driver. Most of polaris is a web page, and the web page has its
own suite in the polaris repository, so these tests are about the places a
browser test cannot reach: Android's own dialogs and system bars, the device
turning, the accessibility tree that TalkBack reads, and the system font size.

Environment:
  POLARIS_APK   the APK to install (default: the Gradle debug output)
  APPIUM_URL    the Appium server (default: http://127.0.0.1:4723)
  ANDROID_HOME  where adb lives, if it is not on PATH
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path

import pytest
from appium import webdriver
from appium.common.exceptions import NoSuchContextException
from appium.options.android import UiAutomator2Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

HERE = Path(__file__).resolve().parent
APK = Path(os.environ.get("POLARIS_APK") or HERE.parent / "android/app/build/outputs/apk/debug/app-debug.apk")
APPIUM_URL = os.environ.get("APPIUM_URL", "http://127.0.0.1:4723")
ARTIFACTS = HERE / "artifacts"

PACKAGE = "net.evomedia.polaris"
NATIVE = "NATIVE_APP"
WEBVIEW = f"WEBVIEW_{PACKAGE}"

# Houston, typed by hand: the place every test that needs one uses, so the
# results do not depend on what the emulator thinks its location is.
HOUSTON = {"lat": "29.7604", "lon": "95.3698"}


@pytest.fixture(scope="session")
def driver():
    if not APK.is_file():
        pytest.exit(f"No APK at {APK}. Build it with ./gradlew assembleDebug in android/, or set POLARIS_APK.", 2)
    opts = UiAutomator2Options()
    opts.app = str(APK)
    opts.app_package = PACKAGE
    # A clean install every run: the location test needs Android to ask for
    # the permission, and it only asks an app that has never been answered.
    opts.full_reset = True
    opts.auto_grant_permissions = False
    opts.new_command_timeout = 300
    opts.set_capability("appium:uiautomator2ServerInstallTimeout", 120_000)
    opts.set_capability("appium:adbExecTimeout", 120_000)
    opts.set_capability("appium:androidInstallTimeout", 180_000)
    # Listing contexts normally asks each WebView for its pages over DevTools,
    # with a fixed two-second timeout. On an emulator drawing polaris's sky in
    # software that answer can be late, and Appium then drops the WebView as
    # having no pages. The package name is all these tests need to find it.
    opts.set_capability("appium:enableWebviewDetailsCollection", False)
    opts.set_capability("appium:ensureWebviewsHavePages", False)
    opts.set_capability("appium:autoWebviewTimeout", 30_000)
    drv = webdriver.Remote(APPIUM_URL, options=opts)
    drv.orientation = "PORTRAIT"
    yield drv
    try:
        adb(drv, "shell", "settings", "put", "system", "font_scale", "1.0")
    finally:
        drv.quit()


@contextmanager
def web(drv):
    """Work inside the app's WebView, and always come back to the native side.

    Retried for half a minute: the WebView can drop out of the context list
    for a moment while the app is busy, and that is not what any test is about.
    """
    deadline = time.monotonic() + 30
    while True:
        try:
            WebDriverWait(drv, 30).until(lambda d: WEBVIEW in d.contexts)
            drv.switch_to.context(WEBVIEW)
            break
        except NoSuchContextException:
            if time.monotonic() > deadline:
                raise
            time.sleep(1)
    try:
        yield
    finally:
        drv.switch_to.context(NATIVE)


def wait(drv, seconds: float = 20):
    return WebDriverWait(drv, seconds, poll_frequency=0.5)


def by_id(drv, element_id: str):
    # A CSS selector, not By.ID: inside the WebView, Chromedriver speaks W3C
    # WebDriver, which has no "id" strategy, and the Appium client sends it raw.
    return drv.find_element(By.CSS_SELECTOR, f'[id="{element_id}"]')


def tap(drv, element_id: str) -> None:
    """Press a control the way a person would. Call inside web().

    Scrolled to the middle of the screen first: polaris pins its header, and a
    control Chromedriver scrolls to the very top lands underneath it.
    """
    element = by_id(drv, element_id)
    drv.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'center'})", element)
    element.click()


def text_of(drv, element_id: str) -> str:
    """An element's text even when it is hidden. Call inside web().

    Once a position is set, polaris folds the card that holds the readout
    away, and WebDriver reports a hidden element's text as empty.
    """
    return drv.execute_script(
        "const e = document.getElementById(arguments[0]); return e ? e.textContent.trim() : null;",
        element_id)


def place_by_hand(drv) -> None:
    """Give polaris a position, unless it already has one. Call inside web()."""
    if text_of(drv, "outLat") not in ("", "—"):
        return
    if not by_id(drv, "manualEntry").is_displayed():
        tap(drv, "manualToggle")
    for field, value in (("inLat", HOUSTON["lat"]), ("inLon", HOUSTON["lon"])):
        box = by_id(drv, field)
        box.clear()
        box.send_keys(value)
    tap(drv, "latN")
    tap(drv, "lonW")
    tap(drv, "manualApply")
    wait(drv).until(lambda d: text_of(d, "outLat").startswith("29.76"))


def choose_mode(drv, mode: str) -> None:
    """'sky' or 'align', by the same tab a person presses. Call inside web()."""
    tab = "modeSkyBtn" if mode == "sky" else "modeAlignBtn"
    if by_id(drv, tab).get_attribute("aria-selected") != "true":
        tap(drv, tab)
    pane = "paneSky" if mode == "sky" else "paneAlign"
    wait(drv).until(lambda d: by_id(d, pane).is_displayed())


def adb(drv, *args: str) -> str:
    """Run adb against the device under test (for settings Appium does not expose)."""
    exe = shutil.which("adb")
    home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not exe and home:
        exe = str(Path(home) / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb"))
    serial = drv.capabilities.get("deviceUDID") or drv.capabilities.get("udid")
    cmd = [exe or "adb"] + (["-s", serial] if serial else []) + list(args)
    return subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60).stdout


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """On a failure, keep what the screen looked like and the native tree, for the CI artifact."""
    outcome = yield
    report = outcome.get_result()
    if report.when != "call" or not report.failed:
        return
    drv = item.funcargs.get("driver")
    if drv is None:
        return
    ARTIFACTS.mkdir(exist_ok=True)
    try:
        drv.switch_to.context(NATIVE)
        drv.get_screenshot_as_file(str(ARTIFACTS / f"{item.name}.png"))
        (ARTIFACTS / f"{item.name}.xml").write_text(drv.page_source, encoding="utf-8")
    except Exception as exc:  # the report matters more than the evidence
        (ARTIFACTS / f"{item.name}.error.txt").write_text(repr(exc), encoding="utf-8")
