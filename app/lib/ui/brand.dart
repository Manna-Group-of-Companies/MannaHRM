import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/session.dart';

/// **The light green look** (25 November 2026, asked for from a picture: an
/// off-white page, white cards, a deep green for what matters, a lime button
/// on the dark green Today card, serif headings). Every colour on every screen
/// is one of these names, so a change of palette is this block again with
/// other numbers, not a pass over thirty files. The logo keeps its own orange
/// on a white plate; the interface does not wear it.
const kPage = Color(0xFFF3F5F1);
const kCard = Colors.white;
const kRaised = Color(0xFFEEF3EF);
const kLine = Color(0xFFE6EAE5);
const kFieldLine = Color(0xFFD8DED7);

/// Fields are near-white on the white card, held by a hairline; every card
/// carries a hairline a shade darker than the page.
const kField = Color(0xFFFAFBF9);
const kCardLine = Color(0xFFE8ECE7);

/// The primary button: the deep green, white on it.
const kPrimary = Color(0xFF17795A);
const kOnPrimary = Colors.white;

/// [kBrand] and [kBrandDeep] are the dark green of the Today card and the
/// splash; [kBrandTint] is the pale green track behind a bar.
const kBrand = Color(0xFF1D5543);
const kBrandDeep = Color(0xFF123B2F);
const kBrandTint = Color(0xFFE2EFE6);

/// The lime on the dark green card — the one button most people press.
const kLime = Color(0xFFD4EE72);
const kOnLime = Color(0xFF15382B);

/// [kGreen] is a fill, a ring or a mark; [kAccent] is green *text*, dark
/// enough to read at AA on white; [kGreenSoft] its wash.
const kGreen = Color(0xFF1F8A63);
const kAccent = Color(0xFF17795A);
const kGreenSoft = Color(0xFFE3F1E8);

const kInk = Color(0xFF15231C);
const kInk2 = Color(0xFF5F6D65);
const kFaint = Color(0xFF98A39C);

/// The headings' face: the phone's own serif (Noto Serif on Android), so
/// nothing is fetched and a gate with no signal still draws it.
const kSerif = 'serif';

/// Status inks, dark enough to be text on white. Each has a wash for the box
/// it sits in.
const kGood = kAccent;
const kBad = Color(0xFFC8443A);
const kBadSoft = Color(0xFFFCE9E5);
const kWarn = Color(0xFFB7791F);
const kWarnSoft = Color(0xFFFBF0DC);
const kInfo = Color(0xFF2F6BD3);
const kTeal = Color(0xFF0E8378);

/// Accents for the tiles on the two home screens. Status colours are
/// `kStatusColour` in app.dart and are not these — a tile is a door, not a day.
const kTileGreen = kAccent;
const kTileBlue = kInfo;
const kTilePurple = Color(0xFF6E56CF);
const kTileOrange = Color(0xFFD9692B);

/// The dark green card: Today on the home screen, the splash.
const kBrandGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [kBrand, kBrandDeep],
);

/// The punch button's — green, because it is the one thing on the app most
/// people ever press.
const kPunchGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF26A673), kAccent],
);

/// The widest the content is drawn. A tablet gets the phone layout centred at
/// this width, with the tile grids doubled (see [TileGrid]), rather than cards
/// stretched across a metre of glass.
const kMaxContentWidth = 760.0;

/// A heading in the serif face.
TextStyle serif(double size, {Color color = kInk, FontWeight weight = FontWeight.w700}) =>
    TextStyle(fontFamily: kSerif, fontSize: size, fontWeight: weight, color: color, height: 1.2);

/// Every inner screen's bar: no band, the page's own colour, and the title
/// large, in the serif, to the left — "Attendance", "My leave".
AppBar brandBar(String title, {List<Widget>? actions, PreferredSizeWidget? bottom, Widget? leading}) => AppBar(
      title: Text(title, overflow: TextOverflow.ellipsis),
      actions: actions,
      bottom: bottom,
      leading: leading,
      backgroundColor: kPage,
      centerTitle: false,
      toolbarHeight: 64,
      shape: const Border(),
      titleTextStyle: serif(24),
    );

/// The Manna mark and name, small, at the top of a home screen.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key});

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 30,
          height: 30,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
              color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: kCardLine)),
          child: Image.asset('assets/manna_logo.png', fit: BoxFit.contain),
        ),
        const SizedBox(width: 8),
        Text.rich(TextSpan(children: [
          TextSpan(text: 'manna', style: serif(17)),
          TextSpan(text: 'hr', style: serif(17, color: kAccent, weight: FontWeight.w800)),
        ])),
      ]);
}

/// The top of a home screen: the brand and the photo on one line, then
/// "Good morning, Anand" large in the serif, and the date and role under it.
///
/// [banded] draws it on a white band with rounded lower corners, as HR's home
/// does, and puts [child] — HR's own attendance — inside the band. The banded
/// header keeps the whole name: HR phones are shared, and two Priyas is one
/// login looking like another's.
class HomeHeader extends StatelessWidget {
  const HomeHeader({
    super.key,
    required this.name,
    required this.role,
    this.greeting = '',
    this.subtitle = '',
    this.image = '',
    this.roleColor = kInk2,
    this.onAvatar,
    this.banded = false,
    this.child,
  });

  final String name;
  final String role;
  final String greeting;

  /// Today's date, as the site has it — "Wednesday, 25 November".
  final String subtitle;
  final String image;
  final Color roleColor;
  final VoidCallback? onAvatar;
  final bool banded;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    final first = name.trim().split(RegExp(r'\s+')).first;
    // On HR's band "Hi," is its own word, so the whole name stays findable as
    // itself.
    final Widget headline = banded
        ? Row(children: [
            Text('Hi, ', style: serif(26)),
            Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: serif(26))),
          ])
        : Text(greeting.isEmpty ? name : '$greeting, $first',
            maxLines: 2, overflow: TextOverflow.ellipsis, style: serif(26));
    final under = [subtitle, role].where((s) => s.isNotEmpty).join('  ·  ');
    final body = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const BrandMark(),
        const Spacer(),
        InkWell(
          customBorder: const CircleBorder(),
          onTap: onAvatar,
          child: Avatar(name: name, image: image, radius: 20, color: kAccent),
        ),
      ]),
      const SizedBox(height: 20),
      headline,
      if (under.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(under,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: roleColor)),
      ],
      if (child != null) ...[const SizedBox(height: 18), child!],
    ]);
    if (!banded) {
      return Padding(padding: EdgeInsets.fromLTRB(20, top + 14, 20, 4), child: body);
    }
    return Container(
      padding: EdgeInsets.fromLTRB(18, top + 14, 18, 20),
      decoration: BoxDecoration(
        color: kCard,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28)),
        boxShadow: [BoxShadow(color: kBrandDeep.withValues(alpha: .06), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: body,
    );
  }
}

/// `Good morning` by the site's hour, not the phone's.
String greeting(int hour) => hour < 12
    ? 'Good morning'
    : hour < 17
        ? 'Good afternoon'
        : 'Good evening';

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// "Wednesday, 25 November".
String longDate(DateTime d) => '${_weekdays[d.weekday - 1]}, ${d.day} ${_months[d.month - 1]}';

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
    final c = color ?? kAccent;
    final url = image.isEmpty
        ? ''
        : image.startsWith('http')
            ? image
            : '${Session.I.siteUrl}$image';
    return CircleAvatar(
      radius: radius,
      backgroundColor: c.withValues(alpha: .13),
      foregroundImage: url.isEmpty ? null : NetworkImage(url, headers: Session.I.authHeaders),
      onForegroundImageError: url.isEmpty ? null : (_, _) {},
      child: Text(initialsOf(name), style: TextStyle(color: c, fontWeight: FontWeight.w800, fontSize: radius * .7)),
    );
  }
}

/// The card everything sits on: white, a hairline, soft corners.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.onTap, this.color = kCard});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color color;

  @override
  Widget build(BuildContext context) => Material(
        color: color,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: color == kCard ? kCardLine : Colors.transparent),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      );
}

/// An icon on a soft square of its own colour — at the head of every row.
class IconBadge extends StatelessWidget {
  const IconBadge(this.icon, {super.key, this.color = kAccent, this.size = 40});

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: color.withValues(alpha: .11), borderRadius: BorderRadius.circular(size * .3)),
        child: Icon(icon, color: color, size: size * .5),
      );
}

/// A door on a home screen. Without a [count] it is a quick action: the icon
/// and the word side by side on a pale green pill. With one it is a figure:
/// the icon, the number large in the serif, and a small label.
class Tile extends StatelessWidget {
  const Tile({super.key, required this.icon, required this.label, required this.onTap, this.color = kGreen, this.count});

  final IconData icon;
  final String label;
  final Color color;
  final String? count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (count == null) {
      return Material(
        color: kGreenSoft,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, color: kAccent, size: 19),
              const SizedBox(width: 8),
              Flexible(
                child: Text(label,
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: kAccent)),
              ),
            ]),
          ),
        ),
      );
    }
    return Panel(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        IconBadge(icon, color: color, size: 38),
        const SizedBox(height: 14),
        Text(count!, style: serif(28)),
        const SizedBox(height: 2),
        Text(label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: kInk2)),
      ]),
    );
  }
}

/// A small figure in a grey box — "18 / Days present" — three to a card.
class StatBox extends StatelessWidget {
  const StatBox({super.key, required this.value, required this.label, this.color = kInk});

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
        decoration: BoxDecoration(color: kPage, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(value, style: serif(24, color: color)),
          const SizedBox(height: 4),
          // One line, shrunk if it must: four boxes to a row on a 320-wide
          // phone is 50 pixels for "Holidays".
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(label,
                maxLines: 1, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kInk2)),
          ),
        ]),
      );
}

/// A small door, three to a row — HR's Quick Actions.
class MiniTile extends StatelessWidget {
  const MiniTile({super.key, required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Panel(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          IconBadge(icon, size: 40),
          const SizedBox(height: 8),
          Text(label,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: kInk)),
        ]),
      );
}

/// Tiles in rows of [columns], at any count. On a screen wide enough — a
/// tablet — the rows hold twice as many, so a tile is never stretched to the
/// width of a page.
class TileGrid extends StatelessWidget {
  const TileGrid(this.tiles, {super.key, this.columns = 2, this.gap = 12});

  final List<Widget> tiles;
  final int columns;
  final double gap;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        var n = columns;
        if (box.maxWidth >= 560 && tiles.length > columns) n = columns * 2;
        if (n > tiles.length && tiles.length > columns) n = tiles.length;
        return Column(
          children: [
            for (var i = 0; i < tiles.length; i += n) ...[
              if (i > 0) SizedBox(height: gap),
              IntrinsicHeight(
                child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  for (var j = 0; j < n; j++) ...[
                    if (j > 0) SizedBox(width: gap),
                    Expanded(child: i + j < tiles.length ? tiles[i + j] : const SizedBox()),
                  ],
                ]),
              ),
            ],
          ],
        );
      });
}

/// A centred heading over a group — "Organization Overview".
class CenterTitle extends StatelessWidget {
  const CenterTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 26, 0, 14),
        child: Text(text, textAlign: TextAlign.center, style: serif(19)),
      );
}

/// One thing somebody asked for, on a card of its own.
class ActivityCard extends StatelessWidget {
  const ActivityCard({super.key, required this.icon, required this.title, required this.subtitle, required this.status});

  final IconData icon;
  final String title;
  final String subtitle;
  final String status;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Panel(
          padding: const EdgeInsets.all(14),
          child: ActivityRow(icon: icon, title: title, subtitle: subtitle, status: status),
        ),
      );
}

/// [ActivityCard]'s line on its own, for a list inside one card: a soft
/// square icon, the title and a line under it, and where it stands.
class ActivityRow extends StatelessWidget {
  const ActivityRow({super.key, required this.icon, required this.title, required this.subtitle, required this.status});

  final IconData icon;
  final String title;
  final String subtitle;
  final String status;

  @override
  Widget build(BuildContext context) {
    final c = wordColour(status);
    return Row(children: [
      IconBadge(icon, color: c, size: 40),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: kInk)),
          const SizedBox(height: 2),
          Text(subtitle,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: kInk2)),
        ]),
      ),
      const SizedBox(width: 8),
      Pill(status, color: c),
    ]);
  }
}

/// A label over a value, with an icon — a profile's line.
class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          IconBadge(icon, size: 36),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 12.5, color: kInk2)),
              const SizedBox(height: 3),
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
        decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)),
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
    case 'Present':
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

/// A heading over a group on a page, with a link on the right.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 22, 2, 10),
        child: Row(children: [
          Expanded(child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: kInk))),
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
      NoteKind.error => (kBadSoft, kBad.withValues(alpha: .25), kBad),
      NoteKind.warn => (kWarnSoft, kWarn.withValues(alpha: .25), const Color(0xFF8A5A12)),
      NoteKind.ok => (kGreenSoft, kAccent.withValues(alpha: .25), kAccent),
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
          Center(child: IconBadge(icon, color: kFaint, size: 64)),
          const SizedBox(height: 14),
          Text(title, textAlign: TextAlign.center, style: serif(18)),
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
        leading: IconBadge(icon, color: color == kInk ? kAccent : color, size: 36),
        title: Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
        subtitle: subtitle == null ? null : Text(subtitle!, style: const TextStyle(color: kInk2)),
        trailing: const Icon(Icons.chevron_right, color: kFaint),
        onTap: onTap,
      );
}

/// Behind the first card under a banded header: the band carried on for the
/// card's top third, so the card sits across the band's edge.
const kBandEdge = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [kCard, kCard, kPage, kPage],
  stops: [0, .32, .32, 1],
);

/// A field's name over the field, rather than a label that floats inside the
/// box.
class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 2, bottom: 8),
        child: Text(text, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: kInk)),
      );
}

/// A status on a wash with an icon — "✓ Present" on the Today card.
class StatusTag extends StatelessWidget {
  const StatusTag(this.text, {super.key, required this.color, this.icon, this.background});

  final String text;
  final Color color;
  final IconData? icon;

  /// Its own fill, for a tag on the dark green card.
  final Color? background;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
        decoration:
            BoxDecoration(color: background ?? color.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 5)],
          Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
        ]),
      );
}
