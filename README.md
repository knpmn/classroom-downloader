# classroom-downloader

adds a download button directly on every google drive attachment in google classroom. -  no more opening the file, waiting for drive to load, find the download and click download --> that's like 3 extra step for every file 

works on both the class stream page and individual material/assignment pages.

this should be a default feature tbh.

<img width="373" height="82" alt="download button on attachment card" src="https://github.com/user-attachments/assets/f238c4d8-8e3d-48e2-b1c6-d1ed6cc66ce1" />

---

## install

1. install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. open the Tampermonkey dashboard → **Create a new script**
3. paste the contents of [`classroom-downloader.user.js`](./classroom-downloader.user.js)
4. save (`Ctrl+S`) and reload any classroom page

---

## how it works

scans for any `drive.google.com/file/d/` link on the page and injects a small button onto its attachment card. clicking it hits the direct usercontent download endpoint google uses internally, so the file goes straight to your downloads folder.

handles classroom's virtual scroll too — when you scroll down and back up, cards get recycled in the DOM and the buttons come back with them.

---

## notes

- you need to be logged into the google account that has access to the files
- the script preserves your `authuser` index so it works with multiple google accounts
- class names in google classroom's frontend are build-time generated and change on deploys — this script intentionally avoids relying on them, using structural DOM signals instead

---

made with [Claude](https://claude.ai) - with some manual debugging
