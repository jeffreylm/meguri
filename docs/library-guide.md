# Organize and review your media

Meguri builds a catalogue of files in folders you scan. Your original media stays
where it is. You can find clips across folders, keep reusable searches, and review
footage before bringing it into your edit.

The left rail shows Meguri's version and build ID below the settings cog. Both
also appear in **Settings → App → About**, where you can select and copy them
when reporting an issue.

- [Choose the Dark Studio theme](#choose-the-dark-studio-theme)
- [Make a Smart bin](#make-a-smart-bin)
- [Find new downloads](#find-new-downloads)
- [Recover Pexels source links](#recover-pexels-source-links)
- [Find audio by its properties](#find-audio-by-its-properties)
- [Import audio covers](#import-audio-covers)
- [Find Artlist covers](#find-artlist-covers)
- [Understand empty results and paused filters](#understand-empty-results-and-paused-filters)
- [Scrub and review footage](#scrub-and-review-footage)
- [Open a separate player window](#open-a-separate-player-window)

## Choose the Dark Studio theme

Open **Settings → General**, set **Appearance** to **Dark**, then choose
**Dark Studio** under **Theme**. The palette takes its charcoal panels and red
selection accents from the DaVinci Resolve Color page, with brighter text for
Meguri’s filters and labels. The appearance button in the toolbar switches to
the theme’s neutral light variant.

## Make a Smart bin

A **Smart bin** is a saved search. It updates when files are scanned or their tags
and ratings change. You do not have to move or copy files into it.

1. Add a media directory using **Add video directory** in the left rail. Wait for
   the scan to finish. Add more directories the same way.
2. Beside **Smart bins**, choose **Global** to search all scanned directories.
3. Click **+**, then name the bin, for example **Best 4K footage**.
4. Select **Video**, choose **4K UHD (3840 × 2160)**, and set the resolution match
   to **At least**. Click the fourth star to require four stars or more.
5. Check the other conditions in the editor and click **Save**. The editor starts
   from your current browsing filters, so remove any conditions you do not want
   to save. Repeat these steps to create more bins.

Choose **Exactly** when you need a specific preset's dimensions. **At least**
uses Meguri's resolution classes, so larger footage and suitable cropped cinema
footage can match. Portrait and landscape versions are treated consistently.
Select **Video**, **Image**, and **Audio** individually. Selecting **Video**
and **Image** shows both, and each selection adds its own removable chip.
For stills or audio only, leave just that type selected. Click **All** to clear
the media-type selection. Inside a Smart bin, all four choices stay visible.
Types excluded by the bin are dimmed, and **All** still respects the bin’s
saved rules.

### Change where a bin searches

**Global** searches every scanned folder. **Local** returns to your last visited
scanned folder and, when browsing by folder, its subfolder. Choose another scanned
folder in the left rail to apply the same bin there. The highlighted location
and the caption under Global/Local show where you are. The selected bin stays
highlighted as you move between locations or change filters.

Think of the search in this order:

| Part             | What it decides                          | Where to change it                   |
| ---------------- | ---------------------------------------- | ------------------------------------ |
| Location         | Which folders can supply files           | **Global / Local** and the left rail |
| Smart bin        | Which files belong to the saved view     | The bin's pencil button              |
| Browsing filters | Which of those files you want to see now | The filter bar above the results     |

For example, apply **New files → Today** to **Best 4K footage** to see only today's
matching clips. The saved four-star and 4K rules remain in place. **Clear all**
removes browsing filters and paused choices while keeping the bin and location.
Choose **All media** or the close button beside the bin name to leave the bin.
Your browsing filters follow you. Opening a manual collection or Watch Later
also leaves the bin.

Meguri remembers the location, last local folder, selected bin, and browsing
filters between launches. A configured default bin opens when there is no
selected bin to restore.

## Find new downloads

1. Open **Watch folders** in the library header, beside **Scan**.
2. Check **Automatically watch scanned folders**. It is on by default. While
   Meguri is running, it listens for changes and waits for downloads to settle
   before indexing them. The menu shows how many folders it is watching. Use
   **Scan** for a folder that cannot be watched or to refresh it yourself.
3. Open **New files** in the filter bar and choose a **Time window**: **Last hour**,
   **Today**, **This week**, **Last 24 hours**, or **Last 7 days**. Today and this
   week follow local time, with Monday as the start of the week.
4. Under **Define new using**, choose the date that fits your work:

   | Choice                                   | What counts as new                                                                                                 |
   | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
   | **First discovered by Meguri** (default) | When the file first entered this catalogue. Useful for a batch of downloads, even if the media was made years ago. |
   | **File creation date**                   | The date stored by the filesystem. A file with no creation date cannot match this choice.                          |

Use the same control in Global, Local, or a Smart bin. To keep a reusable view,
create a bin with **New files** set to **Today**, for example **Today's downloads**.
The time window moves as the day changes; it does not become a fixed date.
The chosen date basis and active browsing filters survive a restart.

**Watch folders** updates the catalogue; **New files** narrows the catalogue you
see. You can use New files after a manual scan even with watching turned off.
Watching uses filesystem notifications rather than repeatedly scanning idle
folders. Network and removable drives can vary in notification support.

## Recover Pexels source links

Save a clip's original Pexels page so you can return to the same upload later,
for example to check whether Pexels offers a 4K download of your HD clip. The
**Source** section in a video's details shows the saved Pexels ID and an
**Open source** button. Use **Add source** or **Edit source** to paste the
address of the video page, for example `https://www.pexels.com/video/2499611/`.

The recovery button is on the location row below the filters in both
**Local** and **Global**. With folder view on, the Local button sits beside
**Open in file manager** and **Copy path**. **Recover folder links** reviews
indexed videos in the current folder and its subfolders, regardless of
browsing filters. If folder view is off, it starts at the scanned folder's root. In
**Global**, **Recover matching links** reviews videos across all scanned
folders that match the active Smart bin and browsing filters. Both switch to
**Recover selected links** when you select clips. That action is also in the
selection bar. Narrow the scope or select clips if more than 5,000 videos match.

Each row shows your library thumbnail on the left and a Pexels preview on the
right. The dimensions and format badge under the library thumbnail describe
the copy already on your disk, so you can see whether you have the resolution
you want before opening the source. Compare the two previews before accepting a
suggestion. The stills may come from different moments in the clip. If the right-hand preview is unavailable, use
**Open source** to check the video in your browser. For an unknown source,
paste a Pexels video URL and leave the field to load its preview.

- **Source already saved** means the clip has a link. The batch leaves it as it is.
- **Suggested from filename** means Meguri recognized a Pexels download name
  such as `pexels-tima-miroshnichenko-5586539.mp4` or
  `2169880-hd_1920_1080_30fps.mp4`. It also recognizes older names such as
  `Pexels Videos 2380095.mp4` and `production ID 4098433.mp4`. This note appears
  below the Pexels preview. If the video matches, tick **Save this link** to
  include it when you click **Save links**.
- **Source unknown** means you can paste a video page URL if you have it.
  Leave the field empty to skip the clip.

Click **Save links** to commit your choices. The review stays open and saved
rows show **Source already saved** both now and when you open the review again.
To replace or undo a link, choose **Edit source** on its row. Paste a replacement
URL and click **Save**, or click **Remove source**. A removed link may appear
again as a filename suggestion you can review.

Meguri stores the link in the workspace catalogue and leaves the media file untouched. A normal rename or
move within that workspace keeps the link when Meguri recognizes the same
clip. Filename suggestions and library thumbnails work offline. Meguri requests
the online previews from Pexels while you review.

## Find audio by its properties

Select only **Audio**, then open **Audio properties**. Resolution controls give way to
sample rate, source bit depth, channels, codec, minimum bitrate, and duration.
The audio file's details also show the properties Meguri could read.

For a bin of high-resolution stereo recordings, choose **96 kHz**, set its match
to **At least**, choose **24-bit** with **At least**, and choose **Stereo**. Use
**Exactly** for a delivery requirement such as precisely 48 kHz. Mono and
multichannel are also available. A file with an unknown property does not match
an active filter on that property; for example, a compressed recording may not
have a source bit depth to report.

Choose **Exactly**, **At least**, **At most**, or **Between** for duration. For
**Between**, enter a minimum and maximum in the selected format. The input shows
an example; the following three entries represent the same duration:

| Format                  | Enter for 2 minutes, 30 seconds |
| ----------------------- | ------------------------------- |
| Seconds                 | `150`                           |
| Minutes                 | `2.5`                           |
| Minutes:seconds (MM:SS) | `02:30`                         |

Use a colon for `MM:SS`; the seconds part must be `00`–`59`. Changing format keeps
the duration value. An invalid entry or a minimum above the maximum needs to be
corrected before saving the bin.

## Import audio covers

In a scanned workspace, open the arrow beside **Scan** and choose **Import audio
covers**. Select a cover list prepared for that workspace. The list matches exact
paths within the workspace and checks each track's duration within one second.
Meguri shows how many tracks matched and how many it skipped. Tracks with
embedded artwork keep their existing cover.

Covers appear on audio thumbnails and in the player. Meguri stores the images
in its catalogue and keeps them through scans and index rebuilds. The audio
files stay untouched. One image can cover multiple tracks on the same album.
Once imported, the images work offline.

A cover list is a JSON file next to its JPEG or PNG images. Each album has an
image filename and its verified tracks. Paths are relative to the scanned
workspace, including the file extension.

```json
{
  "version": 1,
  "albums": [
    {
      "image": "album-cover.jpg",
      "tracks": [{ "path": "Artist - Track.wav", "durationSeconds": 155 }]
    }
  ]
}
```

## Find Artlist covers

1. Open the workspace that contains your Artlist music. In the menu beside
   **Scan**, choose **Open Artlist sign-in**.
2. Sign in to Artlist in the window Meguri opens. On **Downloads → Songs**,
   choose **All Time** to include older downloads.
3. Return to your workspace and choose **Find Artlist covers** from the same
   menu. Meguri reads the song history in that window, verifies the track and
   artist names against your local filenames, and checks the duration and version.

Meguri adds the square album covers for confirmed matches. It keeps existing
covers and leaves tracks with multiple possible matches for review. The result
shows how many covers it added and how many tracks still need artwork.
Choose **Stop Artlist matching** or close the Artlist window to stop the search.
Any covers already applied stay in your catalogue.

The Artlist window keeps its sign-in for the current Meguri session. The search
reads song details and fetches album images. It stores the confirmed covers
locally so they remain visible when Artlist is closed or you're offline.

## Understand empty results and paused filters

Read the high-contrast summary above the results. It shows the bin's saved rules,
your active browsing conditions, and any remembered filters that are not applied.

- **No files match these filter criteria.** A valid filter can narrow the bin to
  zero. For example, **Exactly 720p** applies to video but cannot match a **4K**
  bin. It stays active. Change or remove it with the × beside its chip.
- **Filter combination has no matches.** Multiple conditions have narrowed the
  view to zero. Review the rules above; try removing one condition at a time.
- **Unavailable.** The filter does not apply to this media type, such as a video
  resolution filter in an audio-only bin. Its value is remembered and paused.
  The file area stays blank, and the message names the paused filter.
- **Off.** The remembered filter can now apply, for example after you edit the
  bin's media type. Click it to enable it, or use its × to remove it. Meguri
  does not enable it automatically while you are still in that bin.

Entering a different bin, or leaving and returning, checks your full incoming
filter set again. An audio choice paused in a video bin can apply in an audio
bin. Changing Global/Local or moving to another folder keeps the current visit's
choices. If you want to see the saved bin on its own, use **Clear all**.

## Scrub and review footage

In grid or list view, hover over a video thumbnail and move the pointer left to
right. The left edge is the beginning of the clip and the right edge is the end.
After a short pause, Meguri shows sampled frames as you move.

| While hovering                                 | macOS                     | Windows / Linux     |
| ---------------------------------------------- | ------------------------- | ------------------- |
| Hide the thumbnail's controls for a clean view | Hold **Option**           | Hold **Alt**        |
| Show a larger clean preview beside it          | Hold **Command + Option** | Hold **Ctrl + Alt** |

Keep the pointer on the **original thumbnail**. The larger preview stays beside
it, fits the available space, and is up to twice the thumbnail's displayed size.
It uses a sharper frame source without getting bigger: 720 pixels wide, or 960
with the High preview setting. Outside enlarged mode, scrubbing uses your
chosen quality. Release the keys to return to the usual controls. Leaving the
thumbnail, pressing Escape, scrolling, resizing, or switching apps dismisses
the preview. If dismissed while the pointer is still there, move away and back
before scrubbing again. Hover preview is a quick visual check; it samples frames
and is silent. Still images, audio, and very short clips keep their poster image.
Use **Hover preview** and **Preview quality** in Settings to adjust ordinary
scrubbing.

Click a video thumbnail to open the compact player. The **Scenes** strip stays
below the video when you resize or scroll through file details. Click a scene to
seek to it, or click its star to make that frame the main thumbnail. Scroll the
strip horizontally for more scenes. You can change the scene count in Settings.

- **Move:** drag the player's title bar inside the Meguri window.
- **Resize:** grab an edge or any corner. The video and scenes fit together, and
  the player remembers its size and position. Focus a handle or the title bar
  and use arrow keys for keyboard resizing or moving.
- **Keep browsing:** use **Open as side peek** to dock the player beside the
  library. Tags, ratings, and history scroll in their own area below the scenes.

### Read filenames and formats

`Interview.final.v2.mov` appears as **Interview.final.v2**. The **MOV** label sits
beside resolution and duration on the card and beside the title in the player.
The original filename is available on hover and in file actions. Search and drag
still use the original name. **MOV** and **MP4** identify file formats; the codec
inside them is shown separately in the file's details.

## Open a separate player window

Use **Open in separate window** in the player header to review video or images
while keeping the full catalogue available. Move the new window by its title bar
or place it on another display. Resize it like any other desktop window. Video
keeps its playback position and play/pause state, and the scene strip remains
attached. Close the preview window to return your attention to the library.

When you are ready to use a clip, hover over its grid or list thumbnail and drag
the arrow beside the selection checkbox into the destination app, such as the
DaVinci Resolve Media Pool. Drag from a selected clip's arrow to carry the whole
selection. The destination app decides how to import the original files.

### Apple ProRes playback

Open a ProRes clip in the player as usual. Meguri streams a local H.264 preview
at up to 1920 × 1080, with audio when the clip has it. The player and scene
strip still use the source clip’s timeline. Meguri keeps the original ProRes
file for dragging into Resolve and for **Open externally**.

Meguri tone maps ProRes clips tagged as PQ or HLG HDR for the built-in player
when FFmpeg supports the conversion. This brings bright highlights and wide
colors into range for a standard display. SDR clips use the regular preview.
Resolve receives the original HDR file.

For clips with multiple audio tracks, use **Audio track** beside volume in the
full player. This works for ProRes, MKV, AVI, WMV, FLV, and TS. **Default**
follows the app's usual playback selection. Meguri keeps your playhead and
play or pause state when you switch, and remembers the selected track for
that clip across restarts. Resolve receives the original with all its tracks.

When Meguri repackages an MKV or another preview container, it converts
Dolby Digital (AC-3) and Dolby Digital Plus (E-AC-3) audio to AAC so the
built-in player can open the stream. The preview keeps the original picture
and surround channel count. The conversion happens as you play or seek.

### Embedded subtitles

Use **Subtitle track** in the regular or fullscreen player to select an
embedded text track. Meguri loads cues around the playhead as you watch or seek.
**Match audio language** looks for a matching subtitle when the audio language
is known. Choose a specific track or **Off** to override that match for the clip.
Your audio and subtitle choices are saved independently. Bitmap subtitles
such as PGS and VobSub need a separate renderer.

## Film information

Meguri can flag likely films while you browse your local catalogue. It looks for
a title and year followed by release details such as `1080p`, `AMZN` or `WEB-DL`.
For example, `A City at Night (2025) (1080p AMZN WEB-DL x265).mkv` suggests
**A City at Night (2025)**. Episodic names are skipped. A name is a suggestion and can be
corrected before lookup.

- Open a detected film and choose **Get film info** in the player header. For
  other videos, **Add film info** is available in the Film details section.
  Search by title and optional year, or paste an IMDb title link or ID.
- Use **Review film candidates** beside the library or folder actions to look up
  a batch. The review uses the selected videos when there is a selection and
  the current filtered view otherwise. Use **Next batch** to continue through
  a longer view. Check which suggestions to look up, choose the correct match
  in each row, and save the matches you confirmed.
- Online lookup uses your own [OMDb key](https://www.omdbapi.com/apikey.aspx).
  Paste either the short key or the full API URL from the OMDb email. The
  **Look up film** button sits directly below these fields. Meguri extracts
  the key from the URL and keeps it in memory for the current session. Meguri contacts
  OMDb only when you press a lookup or save button. It sends the proposed title
  and year or IMDb ID, and requests the poster for a confirmed match when
  available. Local paths and video contents stay on your computer.

Confirmed details and artwork are available offline. The Film details section
shows the title, cast, director, genres, synopsis, runtime, certificate and
IMDb rating when available. Available poster art appears on the catalogue card,
where hover scrubbing still shows the original clip. The film link can be
changed or removed from the same section. Opening the video in VLC or another
external player continues to open the original file.

Search for `has:film` to show saved films, `has:film-candidate` to show
unmatched suggestions, or use `film:thriller` and `film:"Alex Rivera"` to
search saved fields. Combine those with the library's other filters.

When Finder removes a file, the next completed scan of that folder removes
film details and poster data if the workspace has no remaining copy. Watch
folders can reconcile the removal automatically.

## Player and button controls

The detail player's expand control also enlarges a small Meguri window,
within the current display's usable area. Shrinking the player leaves the
Meguri window at its current size. Drag the marked bottom-right corner of
the main window, detached player or detached note editor to resize it.

Button tooltips are on by default. They appear briefly after hovering over
a control or reaching it with the keyboard. Toggle **Button tooltips** in
**Settings**. Meguri remembers the setting between launches.
