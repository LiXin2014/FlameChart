enum Categories {
    Kernel = "Kernel",
    IO = "IO",
    File = "File",
    JIT = "JIT",
    Networking = "Networking",
}

enum ColorCategory {
    Green,
    Red,
    Yellow,
    Purple,
    Blue,
    Warm,
}

export class Color {
    /*Return a color for the given name and library type. The library type
    selects the hue, and the name is hashed to a color in that hue.*/
    static colorHash(name: string, libtype: string = "") {
        var r,g,b;
        // default when libtype is not in use
        var hue = ColorCategory.Warm;

        if (libtype) {
            if (libtype === Categories.Kernel) {
                hue = ColorCategory.Green;
            } else if (libtype === Categories.IO) {
                hue = ColorCategory.Red;
            } else if (libtype === Categories.File) {
                hue = ColorCategory.Yellow;
            } else if (libtype === Categories.JIT) {
                hue = ColorCategory.Purple;
            } else if (libtype === Categories.Networking) {
                hue = ColorCategory.Blue;
            }
        }

        // calculate hash
        var vector = 0;
        if (name) {
            var nameArr = name.split('`');
            if (nameArr.length > 1) {
                name = nameArr[nameArr.length - 1]; // drop module name if present
            }
            name = name.split('(')[0]; // drop extra info
            vector = Color.generateHash(name);
        }

        // calculate color
        if (hue === ColorCategory.Red) {
            r = 200 + Math.round(55 * vector);
            g = 50 + Math.round(80 * vector);
            b = g;
        } else if (hue === ColorCategory.Yellow) {
            r = 175 + Math.round(55 * vector);
            g = r;
            b = 50 + Math.round(20 * vector);
        } else if (hue === ColorCategory.Green) {
            r = 50 + Math.round(60 * vector);
            g = 200 + Math.round(55 * vector);
            b = r;
        } else if (hue === ColorCategory.Purple) {
            r = 100 + Math.round(27 * vector);
            g = 50 + Math.round(80 * vector);
            b = 200 + Math.round(55 * vector);
        } else if (hue === ColorCategory.Blue) {
            r = 30 + Math.round(10 * vector);
            g = r;
            b = 200 + Math.round(55 * vector);
        } else {
            // original warm palette
            r = 200 + Math.round(55 * vector);
            g = 0 + Math.round(230 * (1 - vector));
            b = 0 + Math.round(55 * (1 - vector));
        }

        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    /*Return a vector (0.0->1.0) that is a hash of the input string. The hash is computed to favor early characters over later ones, so
    that strings with similar starts have similar vectors. Only the first 6 characters are considered.*/
    static generateHash(name: string) {
        const MAX_CHAR = 6;

        var hash = 0;
        var maxHash = 0;
        var weight = 1;
        var mod = 10;

        if (name) {
            for (var i = 0; i < name.length; i++) {
                if (i > MAX_CHAR) {
                     break; 
                }
                hash += weight * (name.charCodeAt(i) % mod);
                maxHash += weight * (mod - 1);
                weight *= 0.70;
            }
            if (maxHash > 0) { 
                hash = hash / maxHash; 
            }
        }
        return hash;
    }

}