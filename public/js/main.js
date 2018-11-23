$(function () {
    //BEGIN MENU SIDEBAR
    $('#sidebar').css('min-height', '100%');
    $('#side-menu').metisMenu();
    $(window).on("load resize", function () {
        if ($(this).width() < 768) {
            $('body').removeClass();
            $('div.sidebar-collapse').addClass('collapse');
        } else {
            $('body').addClass($.cookie('menu_style') + ' ' + $.cookie('header'));
            $('div.sidebar-collapse').removeClass('collapse');
            $('div.sidebar-collapse').css('height', 'auto');
        }

        if($('#sidebar').height() > $('#page-wrapper').height()){
            $('#wrapper').css('height', $('#sidebar').height());
        }
    });
    //BEGIN TOPBAR DROPDOWN
    $('.dropdown-slimscroll').slimScroll({
        "height": '250px',
        "wheelStep": 30
    });
    //END TOPBAR DROPDOWN

    //BEGIN THEME SETTING
    $('#theme-setting > a.btn-theme-setting').click(function(){
        if($('#theme-setting').css('right') < '0'){
            $('#theme-setting').css('right', '0');
        } else {
            $('#theme-setting').css('right', '-250px');
        }
    });

    // Begin Change Theme Color
    var list_menu = $('.dropdown-theme-setting > li > select#list-menu');
    var list_header = $('.dropdown-theme-setting > li > select#list-header');
    var list_lan = $('.dropdown-theme-setting > li > select#list-lan');

    // FUNCTION CHANGE URL STYLE ON HEAD TAG
    var setTheme = function (menu_style, header) {
        $.cookie('menu_style', menu_style);
        $.cookie('header', header);

        $('body').removeClass();
        $('body').addClass(menu_style + ' ' + header);
        // Set slimscroll when sidebar fixed
        if ($.cookie('header') == 'header-fixed') {
            if ($('body').hasClass('sidebar-collapsed')) {
                $('#side-menu').attr('style','').parent('.slimScrollDiv').replaceWith($('#side-menu'));
            } else {
                setTimeout(function(){
                    $('#side-menu').slimScroll({
                        "height": $(window).height() - 100,
                        'width': '250px',
                        'wheelStep': 30
                    });
                    $('#side-menu').focus();
                }, 500)
            }
        } else {
            $('#side-menu').attr('style','').parent('.slimScrollDiv').replaceWith($('#side-menu'));
        }
    };

    // Check cookie when window reload and set value for each option(menu,style,color)
    //if ($.cookie('menu_style')) {
        if ($('body').hasClass('clear-cookie')) {
            $.removeCookie('menu_style');
        } else {
            list_menu.find('option').each(function(){
                if($(this).attr('value') == $.cookie('menu_style')) {
                    $(this).attr('selected', 'selected');
                }
            });
            list_header.find('option').each(function(){
                if($(this).attr('value') == $.cookie('header')) {
                    $(this).attr('selected', 'selected');
                }
            });
            list_lan.find('option').each(function(){
                if($(this).attr('value') == $.cookie('locale')) {
                    $(this).attr('selected', 'selected');
                }
            });
            setTheme($.cookie('menu_style'), $.cookie('header'));
        }
    //};
    // SELECT MENU STYLE EVENT
    list_menu.on('change', function(){
        // No Menu style 3 fixed
        if (($.cookie('header') == 'header-fixed') && ($(this).val() == 'sidebar-icons')) {
            setTheme($(this).val(), 'header-static');
            return;
        }
        setTheme($(this).val(), list_header.val());
    });
    // SELECT HEADER EVENT
    list_header.on('change', function() {
        // No Menu style 3 fixed
        if (($.cookie('menu_style') == 'sidebar-icons') && ($(this).val() == 'header-fixed')) {
            return;
        }
        setTheme(list_menu.val(), $(this).val());
    });
    // SELECT LAN EVENT
    list_lan.on('change', function(){
        var opts = {
            path: '/',
            maxAge: 1000 * 60 * 60 * 24 * 30,
            signed: true,
            httpOnly: true
        };
        $.cookie('locale', $(this).val(), opts);
        location.reload();
    });
    // End Change Theme Color
    //END THEME SETTING

    //BEGIN BACK TO TOP
    $(window).scroll(function(){
        if ($(this).scrollTop() < 200) {
            $('#totop') .fadeOut();
        } else {
            $('#totop') .fadeIn();
        }
    });
    $('#totop').on('click', function(){
        $('html, body').animate({scrollTop:0}, 'fast');
        return false;
    });
    //END BACK TO TOP

    // BEGIN SEARCH FORM ON TOPBAR
    var searchval = $('div.input-group > input').val();
    $('#topbar-search').on('click', function (e) {
        $(this).addClass('open');
        $(this).find('.form-control').focus();

        $('#topbar-search .form-control').on('blur', function (e) {


                $('span.input-group-btn > a').on('click', function (e) {
                    var val = $('div.input-group > input').val();
                    alert(val);
                    if(val !== searchval) {
                        searchval = val;
                        $('#topbar-search').submit();
                    }
                });


            $(this).closest('#topbar-search').removeClass('open');
            $(this).unbind('blur');
        });

    });


    // END SEARCH FORM ON TOPBAR

    //END PLUGINS DATE RANGE PICKER
});



