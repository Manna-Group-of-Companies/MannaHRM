import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/session.dart';

/// **The HRDashboard kit's dark look** (26 October 2026, asked for: the phone
/// app drawn like the Figma "HRDashboard" UI kit, its *Visual Design - Dark*
/// page). The kit names no colour variables, so each value here was sampled
/// off its 375-wide phone frames rather than invented. The logo keeps its
/// orange on a white plate; the interface does not wear it.
///
/// A dark interface is what the link asked for. Every colour on every screen
/// is one of these names, so a light kit palette later is this block again
/// with other numbers, not a pass over thirty files.
const kPage = Color(0xFF121828);
const kCard = Color(0xFF212A39);
const kRaised = Color(0xFF303948);
const kLine = Color(0xFF2D3645);
const kFieldLine = Color(0xFF465061);

/// The kit's primary button is white with the page's navy on it — the
/// reverse of its light page, where the same button is navy.
const kPrimary = Colors.white;
const kOnPrimary = kPage;

/// [kBrand] and [kBrandDeep] are the chrome — a home screen's header, a
/// summary card — drawn a step up from the cards beneath them.
const kBrand = kRaised;
const kBrandDeep = kCard;
const kBrandTint = kRaised;

/// The kit's green. [kGreen] is a fill, a ring or a mark; [kAccent] is green
/// *text*, lifted so it still reads at AA on a dark card; [kGreenSoft] its wash.
const kGreen = Color(0xFF19A974);
const kAccent = Color(0xFF4ADE9B);
const kGreenSoft = Color(0x2E19A974);

const kInk = Color(0xFFF4F5F7);
const kInk2 = Color(0xFFA3AAB6);
const kFaint = Color(0xFF6E7787);

/// Status inks, light enough to be text on [kCard]. Each has a wash for the
/// box it sits in. On the light palette these were the website's dark shades;
/// on a dark card the same hue is used a few steps paler.
const kGood = kAccent;
const kBad = Color(0xFFFF7A80);
const kBadSoft = Color(0x2EFF5A61);
const kWarn = Color(0xFFF2CC60);
const kWarnSoft = Color(0x2EF2CC60);
const kInfo = Color(0xFF7DA7FF);
const kTeal = Color(0xFF45CFC0);

/// Accents for the tiles on the two home screens. Status colours are
/// `kStatusColour` in app.dart and are not these — a tile is a door, not a day.
const kTileGreen = kAccent;
const kTileBlue = kInfo;
const kTilePurple = Color(0xFFB79CFF);
const kTileOrange = Color(0xFFFFA866);

/// The chrome's gradient: a home screen's header, a summary card.
const kBrandGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [kBrand, kBrandDeep],
);

/// The punch button's — the one green surface on the app, because it is the
/// one thing on it most people ever press.
const kPunchGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF22C487), kGreen],
);

/// Every inner screen's bar, the kit's way: no band, the page's own colour,
/// and the title large and to the left behind a bare chevron — "‹ Detail
/// Employee" — rather than a centred word on a white strip.
AppBar brandBar(String title, {List<Widget>? actions, PreferredSizeWidget? bottom, Widget? leading}) => AppBar(
      title: Text(title),
      actions: actions,
      bottom: bottom,
      leading: leading,
      backgroundColor: kPage,
      centerTitle: false,
      toolbarHeight: 64,
      shape: const Border(),
      titleTextStyle: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: kInk),
    );

/// The top of a home screen, the kit's *Home - V2*: a card-coloured band with
/// the bar in it — menu on the left, the person's avatar and a chevron on the
/// right — and "Hi, Name" over a grey line under that. [overlap] is how far
/// the band runs on below its text, for a card to sit across its edge.
class KitHeader extends StatelessWidget {
  const KitHeader({
    super.key,
    required this.name,
    required this.subtitle,
    this.image = '',
    this.onMenu,
    this.onAvatar,
    this.overlap = 0,
  });

  final String name;
  final String subtitle;
  final String image;
  final VoidCallback? onMenu;
  final VoidCallback? onAvatar;
  final double overlap;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kCard,
      padding: EdgeInsets.fromLTRB(12, MediaQuery.of(context).padding.top + 8, 12, 22 + overlap),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (onMenu != null)
            IconButton(tooltip: 'Menu', onPressed: onMenu, icon: const Icon(Icons.notes_rounded, color: kInk))
          else
            const SizedBox(width: 48),
          const Spacer(),
          InkWell(
            borderRadius: BorderRadius.circular(30),
            onTap: onAvatar,
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Row(children: [
                Avatar(name: name, image: image, radius: 18),
                const SizedBox(width: 6),
                const Icon(Icons.keyboard_arrow_down_rounded, color: kInk2, size: 20),
              ]),
            ),
          ),
        ]),
        const SizedBox(height: 18),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // The whole name, not the kit's first name alone: HR phones are
            // shared, and two Priyas is one login looking like another's.
            Row(children: [
              const Text('Hi, ', style: TextStyle(color: kInk, fontSize: 24, fontWeight: FontWeight.w800)),
              Flexible(
                child: Text(name.trim().isEmpty ? 'there' : name.trim(),
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: kInk, fontSize: 24, fontWeight: FontWeight.w800)),
              ),
            ]),
            const SizedBox(height: 6),
            Text(subtitle, overflow: TextOverflow.ellipsis, style: const TextStyle(color: kInk2, fontSize: 14)),
          ]),
        ),
      ]),
    );
  }
}

/// `Good morning` by the site's hour, not the phone's.
String greeting(int hour) => hour < 12
    ? 'Good morning'
    : hour < 17
        ? 'Good afternoon'
        : 'Good evening';

/// Up to two initials, or `?` — an Employee saved with a blank name must not
/// take a screen down with it.
String initialsOf(Object? name) {
  final parts = '${name ?? ''}'.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.characters.first.toUpperCase();
  return '${parts.first.characters.first}${parts.last.characters.first}'.toUpperCase();
}

/// A person's photo off their Employee record, or their initials.
///
/// The photo is usually a private file, served only to a session that may read
/// the record — so the request carries this session's cookie, and a photo the
/// login may not see falls back to the initials rather than a broken image.
class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.image = '', this.radius = 22, this.color});

  final String name;
  final String image;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? kInk;
    final url = image.isEmpty
        ? ''
        : image.startsWith('http')
            ? image
            : '${Session.I.siteUrl}$image';
    return CircleAvatar(
      radius: radius,
      backgroundColor: c.withValues(alpha: .14),
      foregroundImage: url.isEmpty ? null : NetworkImage(url, headers: Session.I.authHeaders),
      onForegroundImageError: url.isEmpty ? null : (_, _) {},
      child: Text(initialsOf(name),
          style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: radius * .7)),
    );
  }
}

/// The card everything sits on.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.onTap});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: kCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      );
}

/// An icon on a raised circle — the kit's, at the head of every stat and row.
class IconBadge extends StatelessWidget {
  const IconBadge(this.icon, {super.key, this.color = kInk, this.size = 40});

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: const BoxDecoration(color: kRaised, shape: BoxShape.circle),
        child: Icon(icon, color: color, size: size * .5),
      );
}

/// A square door on a home screen: an icon and a word, and sometimes a count.
class Tile extends StatelessWidget {
  const Tile({super.key, required this.icon, required this.label, required this.onTap, this.color = kInk, this.count});

  final IconData icon;
  final String label;
  final Color color;
  final String? count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Panel(
        onTap: onTap,
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            IconBadge(icon, color: color, size: 48),
            const SizedBox(height: 16),
            if (count != null) ...[
              Text(count!, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: kInk, height: 1.1)),
              const SizedBox(height: 6),
              Text(label, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: kInk2)),
            ] else
              Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: kInk)),
          ],
        ),
      );
}

/// Two tiles to a row, at any count.
class TileGrid extends StatelessWidget {
  const TileGrid(this.tiles, {super.key});

  final List<Widget> tiles;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (var i = 0; i < tiles.length; i += 2) ...[
            if (i > 0) const SizedBox(height: 12),
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Expanded(child: tiles[i]),
                const SizedBox(width: 12),
                Expanded(child: i + 1 < tiles.length ? tiles[i + 1] : const SizedBox()),
              ]),
            ),
          ],
        ],
      );
}

/// A label over a value, with an icon — a profile's line.
class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 20, color: kInk2),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 13, color: kInk2)),
              const SizedBox(height: 6),
              Text(value.isEmpty ? '—' : value,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: kInk)),
            ]),
          ),
        ]),
      );
}

/// A word on a tinted pill — a status.
class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: .16), borderRadius: BorderRadius.circular(6)),
        child: Text(text, style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: .2)),
      );
}

/// The colour a status word is drawn in, wherever it comes from — leave,
/// corrections, payslips.
Color wordColour(String word) {
  switch (word) {
    case 'Approved':
    case 'Completed':
    case 'Submitted':
    case 'Active':
      return kAccent;
    case 'Refused':
    case 'Rejected':
    case 'Cancelled':
    case 'Left':
      return kBad;
    case 'Draft':
    case 'Inactive':
      return kInk2;
    default:
      return kWarn;
  }
}

/// A heading over a group on a page.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 24, 2, 12),
        child: Row(children: [
          Expanded(child: Text(text, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: kInk))),
          ?trailing,
        ]),
      );
}

/// A sentence in a coloured box: what went wrong, or what just happened.
class Note extends StatelessWidget {
  const Note(this.text, {super.key, this.kind = NoteKind.error});

  final String text;
  final NoteKind kind;

  @override
  Widget build(BuildContext context) {
    final (bg, line, ink) = switch (kind) {
      NoteKind.error => (kBadSoft, kBad.withValues(alpha: .35), kBad),
      NoteKind.warn => (kWarnSoft, kWarn.withValues(alpha: .35), kWarn),
      NoteKind.ok => (kGreenSoft, kAccent.withValues(alpha: .35), kAccent),
    };
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: line)),
      child: Text(text, style: TextStyle(color: ink, fontSize: 13)),
    );
  }
}

enum NoteKind { error, warn, ok }

/// A message in the middle of a list that has nothing in it. A list itself, so
/// pull-to-refresh still works on an empty tab.
class EmptyNote extends StatelessWidget {
  const EmptyNote(this.title, this.body, {super.key, this.icon = Icons.inbox_outlined});

  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(32, 64, 32, 32),
        children: [
          Icon(icon, size: 44, color: kFaint),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: kInk)),
          const SizedBox(height: 6),
          Text(body, textAlign: TextAlign.center, style: const TextStyle(color: kInk2)),
        ],
      );
}

/// A row on a menu page — More, Settings, the admin drawer.
class MenuRow extends StatelessWidget {
  const MenuRow({super.key, required this.icon, required this.label, required this.onTap, this.color = kInk, this.subtitle});

  final IconData icon;
  final String label;
  final String? subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon, color: color),
        title: Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: const Icon(Icons.chevron_right, color: kInk2),
        onTap: onTap,
      );
}

/// Behind the first card under a [KitHeader]: the band carried on for the
/// card's top third, so the card sits across the band's edge as in the kit.
const kBandEdge = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [kCard, kCard, kPage, kPage],
  stops: [0, .32, .32, 1],
);
