const { app, Tray, Menu, nativeImage } = require('electron')
const { execSync, spawn } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')
const sharp = require('sharp')

// Hide from Dock — this is a menu bar only app
app.dock?.hide()

const SERVICE = 'WallpaperChanger'
const USER = os.userInfo().username

function getPassword() {
  try {
    return execSync(`security find-generic-password -s "${SERVICE}" -a "${USER}" -w`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function savePassword(password) {
  try {
    execSync(`security add-generic-password -U -s "${SERVICE}" -a "${USER}" -w "${password.replace(/"/g, '\\"')}"`)
  } catch (e) {
    console.error('Failed to save to Keychain:', e.message)
  }
}

function clearPassword() {
  try {
    execSync(`security delete-generic-password -s "${SERVICE}" -a "${USER}"`)
  } catch {}
}

function promptForPassword() {
  try {
    const result = execSync(
      `osascript -e 'display dialog "Enter your sudo password:" with hidden answer default answer "" buttons {"Cancel", "OK"} default button "OK" with title "Wallpaper Changer" with icon caution'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim()
    const match = result.match(/text returned:(.*)$/)
    return match ? match[1] : null
  } catch {
    return null // user cancelled
  }
}

function findWallpaperFile() {
  const homeDir = os.homedir()
  for (const name of ['wallpaper.jpg', 'wallpaper.jpeg', 'Wallpaper.jpg', 'Wallpaper.jpeg']) {
    const p = path.join(homeDir, 'Downloads', name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function runWithPassword(password, onAuthFail) {
  const source = findWallpaperFile()
  if (!source) {
    execSync(`osascript -e 'display alert "No wallpaper found" message "Put a file named wallpaper.jpg or wallpaper.jpeg in your Downloads folder." as warning'`)
    return
  }
  const cmd = `cp "${source}" /Library/Desktop/Wallpaper.jpg && killall WallpaperAgent; killall Dock`

  const child = spawn('sudo', ['-S', 'sh', '-c', cmd], { stdio: ['pipe', 'pipe', 'pipe'] })

  child.stdin.write(password + '\n')
  child.stdin.end()

  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d.toString()))

  child.on('close', () => {
    const authFailed = /incorrect password|try again|Sorry/i.test(stderr)
    if (authFailed) {
      onAuthFail()
    }
  })
}

function isLoginItemEnabled() {
  return app.getLoginItemSettings().openAtLogin
}

function enableLoginItem() {
  app.setLoginItemSettings({ openAtLogin: true })
}

function disableLoginItem() {
  app.setLoginItemSettings({ openAtLogin: false })
}

function changeWallpaper() {
  let password = getPassword()

  const tryRun = (pwd) => {
    runWithPassword(pwd, () => {
      // Auth failed — clear stored password and prompt again
      clearPassword()
      const newPwd = promptForPassword()
      if (newPwd) {
        savePassword(newPwd)
        runWithPassword(newPwd, () => {
          // Still failing — clear and give up
          clearPassword()
        })
      }
    })
  }

  if (password) {
    tryRun(password)
  } else {
    password = promptForPassword()
    if (password) {
      savePassword(password)
      tryRun(password)
    }
  }
}

app.whenReady().then(async () => {
  // Replace currentColor with black so sharp/librsvg renders strokes correctly
  const svgBuffer = Buffer.from(
    fs.readFileSync(path.join(__dirname, 'monitor.svg'), 'utf8').replace(/currentColor/g, 'black')
  )
  // 48x48 = exactly 2× the 24x24 viewBox → pixel-perfect at scaleFactor 2 (displays at 24pt)
  const pngBuffer = await sharp(svgBuffer).resize(34, 34).png().toBuffer()
  const icon = nativeImage.createFromBuffer(pngBuffer, { scaleFactor: 2 })
  icon.setTemplateImage(true)

  const tray = new Tray(icon)
  tray.setToolTip('Reset my Wallpaper')

  const buildMenu = () => Menu.buildFromTemplate([
    { label: 'Change Wallpaper', click: changeWallpaper },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: isLoginItemEnabled(),
      click: (item) => {
        item.checked ? enableLoginItem() : disableLoginItem()
        tray.setContextMenu(buildMenu())
      },
    },
    { type: 'separator' },
    { label: 'Clear Saved Password', click: () => { clearPassword() } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  tray.on('click', changeWallpaper)
  tray.setContextMenu(buildMenu())
})
