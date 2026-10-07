// SVG to PNG, JPEG or PDF, by the output's extension: kl-raster in.svg out.(png|jpg|jpeg|pdf) [font files...]
// Only the given fonts are used (no system fonts), as `resvg --skip-system-fonts --use-font-file`.
// JPEG at quality 92 (Chrome's canvas default), transparency over black as in Kaleido: plotly's
// `setBackground: 'opaque'` only styles the live <svg>, so Chrome's canvas encodes transparent paper as black.
// PDF at 96 dpi, so a px is 0.75 pt like Chrome's printToPDF; text stays text, with the fonts embedded.
use std::{env, error::Error, fs, process};

fn main() {
    if let Err(e) = run() {
        eprintln!("kl-raster: {e}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    let [input, out, fonts @ ..] = &args[..] else { return Err("usage: kl-raster in.svg out.(png|jpg|jpeg|pdf) [font files...]".into()) };
    let svg = fs::read(input)?;
    let ext = out.rsplit('.').next().unwrap_or("").to_lowercase();
    if ext == "pdf" {
        let mut opt = svg2pdf::usvg::Options::default();
        for f in fonts { opt.fontdb_mut().load_font_file(f)?; }
        let tree = svg2pdf::usvg::Tree::from_data(&svg, &opt)?;
        let pdf = svg2pdf::to_pdf(&tree, Default::default(), svg2pdf::PageOptions { dpi: 96.0 }).map_err(|e| format!("{e:?}"))?;
        fs::write(out, pdf)?;
        return Ok(());
    }
    let mut opt = resvg::usvg::Options::default();
    for f in fonts { opt.fontdb_mut().load_font_file(f)?; }
    let tree = resvg::usvg::Tree::from_data(&svg, &opt)?;
    let size = tree.size().to_int_size();
    let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height()).ok_or("empty image")?;
    match ext.as_str() {
        "png" => {
            resvg::render(&tree, resvg::tiny_skia::Transform::identity(), &mut pixmap.as_mut());
            pixmap.save_png(out)?;
        }
        "jpg" | "jpeg" => {
            resvg::render(&tree, resvg::tiny_skia::Transform::identity(), &mut pixmap.as_mut());
            let rgb: Vec<u8> = pixmap.data().chunks_exact(4).flat_map(|p| [p[0], p[1], p[2]]).collect(); // premultiplied = over black
            jpeg_encoder::Encoder::new_file(out, 92)?.encode(&rgb, size.width() as u16, size.height() as u16, jpeg_encoder::ColorType::Rgb)?;
        }
        _ => return Err(format!("unknown format .{ext} (png, jpg, jpeg, pdf)").into()),
    }
    Ok(())
}
