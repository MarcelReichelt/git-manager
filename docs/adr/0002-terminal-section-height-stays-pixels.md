# Terminal section height stays pixels

Changes and Commits keep a share of their stack, so a resize leaves that share alone. The terminal section keeps a pixel height: dragging it already stores pixels, and a double-click stores one third of the area under the branch heading as pixels, once. Remembering an ongoing third was rejected, because the next window resize would keep moving the terminal section.
