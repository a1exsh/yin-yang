const sampling = 10;
// TODO: test gray area approach
// dark:  0.00 - 0.50
// gray:  0.50 - 0.75
// light: 0.75 - 1.00
const lightnessThreshold = 0.75;

// check @media prefers-color-scheme
function isDark(lightness) {
    return lightness < lightnessThreshold;
}

function compositeBackgroundPixel(ctx, elt) {
    if (elt == null) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 1, 1);
    } else {
        // TODO: test earlier that we got a fully-opaque pixel and unwind
        compositeBackgroundPixel(ctx, elt.parentElement);

        const style = getComputedStyle(elt);
        const bgColor = style.getPropertyValue("background-color");
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, 1, 1);
    }
}

function drawAndGetBackgroundPixel(ctx, elt) {
    const ret = new Uint8ClampedArray(4);
    ctx.clearRect(0, 0, 1, 1);

    compositeBackgroundPixel(ctx, elt);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    ret[0] = pixel[0];
    ret[1] = pixel[1];
    ret[2] = pixel[2];
    ret[3] = pixel[3];

    ctx.clearRect(0, 0, 1, 1);
    return ret;
}

function processImage(image) {
    const width  = image.width;
    const height = image.height;

    // don't bother with images that are to small
    if (width * height < 64*64) {
        return;
    }

    const sw = Math.round(width  / sampling + 0.5);
    const sh = Math.round(height / sampling + 0.5);

    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    ctx.imageSmoothingEnabled = false;

    // try early: if it fails, we spare some cycles
    const bgPixel = drawAndGetBackgroundPixel(ctx, image);
    const backgroundValue = bgPixel[0] + bgPixel[1] + bgPixel[2];
    const backgroundLightness = backgroundValue / (3*255);
    const isBackgroundDark = isDark(backgroundLightness);

    ctx.drawImage(image, 0, 0, width, height, 0, 0, sw, sh);

    const imgData = ctx.getImageData(0, 0, sw, sh);
    const pixels = imgData.data;

    const sampleSize = sw * sh;
    const distinctColorsThreshold = Math.round(sampleSize / 10);
    var distinctColors = 0;

    var isScreenshot = true;
    var sampleValue = 0;
    var sampleColors = {};
    var idx = 0;

    for (var y = 0; y < sh; ++y) {
        for (var x = 0; x < sw; ++x) {
            const r = pixels[idx++];
            const g = pixels[idx++];
            const b = pixels[idx++];
            ++idx;                // ignoring alpha for now

            // TODO: get it down to 16-bit: r >> 3, g >> 2, b >> 3
            const rgb = ((r >> 2) << 16) | ((g >> 2) << 8) | (b >> 2);
            if (sampleColors[rgb] === undefined) {
                sampleColors[rgb] = 1;
                if (++distinctColors > distinctColorsThreshold) {
                    // that's likely not a screenshot, but a photo
                    isScreenshot = false;
                    break;
                }
            }

            sampleValue += r + g + b;
        }
        if (!isScreenshot) {
            break;
        }
    }

    var invertFilterOn = false;
    const setInverted = (_event) => {
        image.classList.add("yin-yang-inverted");
        image.removeEventListener("animationend", setInverted);
    };
    const setOriginal = (_event) => {
        image.classList.remove("yin-yang-inverted");
        image.removeEventListener("animationend", setOriginal);
    };
    const turnInvertOn = () => {
        image.classList.remove("yin-yang-anim-to-original");
        //image.classList.remove("yin-yang-anim-to-inverted");
        image.classList.add("yin-yang-anim-to-inverted");
        image.addEventListener("animationend", setInverted);
        invertFilterOn = true;
    };
    const turnInvertOff = () => {
        image.classList.remove("yin-yang-inverted");
        image.classList.remove("yin-yang-anim-to-inverted");
        image.classList.add("yin-yang-anim-to-original");
        image.addEventListener("animationend", setOriginal);
        invertFilterOn = false;
    };

    const toggleInvert = () => {
        if (invertFilterOn) {
            turnInvertOff();
        } else {
            turnInvertOn();
        }
    };

    const lightness = sampleValue / (3*255 * sampleSize);
    const isImageDark = isDark(lightness);

    if (isScreenshot) {
        if (isImageDark && !isBackgroundDark ||
            !isImageDark && isBackgroundDark) {
            turnInvertOn();
        }
    }

    // add the icon anyway, so that the user can invert image at will
    const div = document.createElement("div");
    div.setAttribute("class", "yin-yang-img-container");
    div.setAttribute("style", `width: ${width}`);

    const button = document.createElement("span");
    button.setAttribute("class", "yin-yang-toggle-button");
    // TODO: show a pop-up with the sample instead of using title
    button.setAttribute("title", `${isScreenshot ? '✓ A screenshot!' : '❌ A photo?'}
sampling=${sampling};
distinctColors=${distinctColors}/${distinctColorsThreshold};
lightness=${lightness.toFixed(2)};
backgroundLightness=${backgroundLightness.toFixed(2)}

Click to toggle invert.`);
    button.innerText = "☯";
    button.addEventListener("click", (_event) => {
        toggleInvert();
        button.classList.add("yin-yang-anim-rotate");
    });
    button.addEventListener("animationend", (_event) => {
        button.classList.remove("yin-yang-anim-rotate");
    });

    image.before(div);
    div.appendChild(image);
    div.appendChild(button);
}

// main
for (const image of document.querySelectorAll("img")) {
    try {
        processImage(image);
    } catch (err) {
        console.error("Failed to process image", image, err);
    }
}
