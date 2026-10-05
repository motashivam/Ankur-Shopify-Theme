$c = [System.IO.File]::ReadAllText('C:\Users\motas\OneDrive\Desktop\Ankur-Shopify-Theme\assets\theme.css')
$old = '@media (max-width: 600px) { .container { width: calc(100% - 32px); } .announcement { height: 32px; font-size: 9px; } .announcement-link { display: none; } .hero {'
$new = '@media (max-width: 600px) { .container { width: calc(100% - 32px); } .announcement { height: 32px; font-size: 10px; } .announcement-link { display: none; } .category-nav { overflow-x: auto; } .category-list { flex-wrap: nowrap; gap: 18px; padding: 10px 0; } .category-list a { font-size: 10px; white-space: nowrap; } .hero {'
$c = $c.Replace($old, $new)
[System.IO.File]::WriteAllText('C:\Users\motas\OneDrive\Desktop\Ankur-Shopify-Theme\assets\theme.css', $c)