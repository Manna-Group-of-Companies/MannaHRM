import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/format.dart';
import 'common.dart';

class Col {
  const Col(this.key, this.label, [this.width = 120]);
  final String key;
  final String label;
  final double width;
}

/// A sortable, searchable table with Export to Excel above it — the eSSL grid.
class Grid extends StatefulWidget {
  const Grid({
    super.key,
    required this.columns,
    required this.rows,
    this.bad,
    this.onSelect,
    this.name = 'export',
  });

  final List<Col> columns;
  final List<Rec> rows;
  final bool Function(Rec row)? bad;
  final ValueChanged<Rec?>? onSelect;
  final String name;

  @override
  State<Grid> createState() => _GridState();
}

class _GridState extends State<Grid> {
  final _search = TextEditingController();
  final _across = ScrollController();
  String? _sortKey;
  bool _backwards = false;
  Rec? _chosen;

  @override
  void didUpdateWidget(Grid old) {
    super.didUpdateWidget(old);
    if (!identical(old.rows, widget.rows)) _chosen = null;
  }

  @override
  void dispose() {
    _search.dispose();
    _across.dispose();
    super.dispose();
  }

  List<Rec> get _shown {
    final out = matching(widget.rows, _search.text, [for (final c in widget.columns) c.key]);
    final key = _sortKey;
    if (key != null) out.sort((a, b) => compareCells(a[key], b[key]) * (_backwards ? -1 : 1));
    return out;
  }

  Future<void> _export(List<Rec> shown) async {
    if (shown.isEmpty) return say(context, 'Nothing to export yet.');
    final home = Platform.environment['USERPROFILE'] ?? Directory.systemTemp.path;
    final folder = Directory('$home\\Documents\\Manna Attendance');
    await folder.create(recursive: true);
    final stamp = DateTime.now().toIso8601String().substring(0, 16).replaceAll(RegExp('[-:T]'), '');
    final file = File('${folder.path}\\${widget.name}-$stamp.csv');
    await file.writeAsBytes(csvBytes([for (final c in widget.columns) (c.key, c.label)], shown));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('${shown.length} rows written to ${file.path}'),
      action: SnackBarAction(label: 'Open folder', onPressed: () => Process.run('explorer.exe', [folder.path])),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shown = _shown;
    final total = widget.rows.length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Text(shown.length == total ? '$total ${total == 1 ? 'row' : 'rows'}' : '${shown.length} of $total rows',
            style: Theme.of(context).textTheme.bodyMedium),
        const Spacer(),
        SizedBox(
          width: 260,
          child: TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
                isDense: true, prefixIcon: Icon(Icons.search, size: 18), hintText: 'Search', border: OutlineInputBorder()),
          ),
        ),
        const SizedBox(width: 10),
        OutlinedButton.icon(
          onPressed: () => _export(shown),
          icon: const Icon(Icons.grid_on, size: 18),
          label: const Text('Export to Excel'),
        ),
      ]),
      const SizedBox(height: 8),
      Expanded(
        child: Card(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: LayoutBuilder(builder: (context, box) {
            final natural = widget.columns.fold<double>(0, (s, c) => s + c.width);
            final stretch = box.maxWidth > natural ? box.maxWidth / natural : 1.0;
            final width = math.max(natural, box.maxWidth);
            return Scrollbar(
              controller: _across,
              thumbVisibility: true,
              child: SingleChildScrollView(
                controller: _across,
                scrollDirection: Axis.horizontal,
                child: SizedBox(
                  width: width,
                  child: Column(children: [
                    Container(
                      color: scheme.surfaceContainerHighest,
                      child: Row(children: [
                        for (final c in widget.columns)
                          InkWell(
                            onTap: () => setState(() {
                              _backwards = _sortKey == c.key && !_backwards;
                              _sortKey = c.key;
                            }),
                            child: SizedBox(
                              width: c.width * stretch,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                                child: Row(children: [
                                  Flexible(
                                    child: Text(c.label,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontWeight: FontWeight.w600)),
                                  ),
                                  if (_sortKey == c.key)
                                    Icon(_backwards ? Icons.arrow_downward : Icons.arrow_upward, size: 14),
                                ]),
                              ),
                            ),
                          ),
                      ]),
                    ),
                    Expanded(
                      child: shown.isEmpty
                          ? Center(child: Text('Nothing to show.', style: TextStyle(color: scheme.outline)))
                          : ListView.builder(
                              itemCount: shown.length,
                              itemExtent: 32,
                              itemBuilder: (context, i) {
                                final row = shown[i];
                                final bad = widget.bad?.call(row) ?? false;
                                final picked = identical(row, _chosen);
                                return Material(
                                  color: picked
                                      ? scheme.primaryContainer
                                      : i.isOdd
                                          ? scheme.surfaceContainerLow
                                          : scheme.surface,
                                  child: InkWell(
                                    onTap: widget.onSelect == null
                                        ? null
                                        : () {
                                            setState(() => _chosen = row);
                                            widget.onSelect!(row);
                                          },
                                    child: Row(children: [
                                      for (final c in widget.columns)
                                        SizedBox(
                                          width: c.width * stretch,
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(horizontal: 10),
                                            child: Tooltip(
                                              message: cell(row[c.key]),
                                              waitDuration: const Duration(milliseconds: 700),
                                              child: Text(
                                                cell(row[c.key]),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(color: bad ? scheme.error : null),
                                              ),
                                            ),
                                          ),
                                        ),
                                    ]),
                                  ),
                                );
                              },
                            ),
                    ),
                  ]),
                ),
              ),
            );
          }),
        ),
      ),
    ]);
  }
}
